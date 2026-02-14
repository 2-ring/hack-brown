"""
Billing API routes for Stripe subscription management.
Handles checkout sessions, webhooks, customer portal, and billing status.
"""

import os
import logging
import stripe

from flask import Blueprint, jsonify, request
from auth.middleware import require_auth
from database.models import User
from billing.stripe_setup import get_pro_price_id

logger = logging.getLogger(__name__)

billing_bp = Blueprint('billing', __name__, url_prefix='/billing')

# Frontend URL for redirect after checkout
FRONTEND_URL = os.getenv('FRONTEND_URL', 'https://dropcal.ai')
if os.getenv('FLASK_ENV') == 'development':
    FRONTEND_URL = 'http://localhost:5173'


def _get_or_create_stripe_customer(user_id: str) -> str:
    """
    Get existing Stripe customer ID or create a new one.
    Lazy — only called when user initiates checkout.
    """
    user = User.get_by_id(user_id)
    if not user:
        raise ValueError(f"User {user_id} not found")

    # Return existing customer if available
    existing_id = user.get('stripe_customer_id')
    if existing_id:
        return existing_id

    # Create new Stripe customer
    customer = stripe.Customer.create(
        email=user.get('email'),
        name=user.get('display_name'),
        metadata={"user_id": user_id},
    )

    # Store on user record
    User.update_stripe_customer_id(user_id, customer.id)
    return customer.id


@billing_bp.route('/create-checkout-session', methods=['POST'])
@require_auth
def create_checkout_session():
    """
    Create a Stripe Checkout Session to upgrade to Pro.

    Returns:
        JSON with checkout_url to redirect the user to.
    """
    try:
        user_id = request.user_id

        # Check if already on pro
        user = User.get_by_id(user_id)
        if user and user.get('plan') == 'pro':
            return jsonify({'error': 'Already on Pro plan'}), 400

        stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
        customer_id = _get_or_create_stripe_customer(user_id)

        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode='subscription',
            line_items=[{
                'price': get_pro_price_id(),
                'quantity': 1,
            }],
            success_url=f'{FRONTEND_URL}/plans?success=true',
            cancel_url=f'{FRONTEND_URL}/plans?canceled=true',
            metadata={'user_id': user_id},
        )

        return jsonify({'checkout_url': session.url})

    except stripe.StripeError as e:
        logger.error(f"Stripe checkout error: {e}")
        return jsonify({'error': 'Failed to create checkout session'}), 500
    except Exception as e:
        logger.error(f"Checkout error: {e}")
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/create-portal-session', methods=['POST'])
@require_auth
def create_portal_session():
    """
    Create a Stripe Customer Portal session to manage subscription.

    Returns:
        JSON with portal_url to redirect the user to.
    """
    try:
        user_id = request.user_id
        stripe.api_key = os.getenv('STRIPE_SECRET_KEY')

        user = User.get_by_id(user_id)
        if not user or not user.get('stripe_customer_id'):
            return jsonify({'error': 'No billing account found'}), 404

        session = stripe.billing_portal.Session.create(
            customer=user['stripe_customer_id'],
            return_url=f'{FRONTEND_URL}/plans',
        )

        return jsonify({'portal_url': session.url})

    except stripe.StripeError as e:
        logger.error(f"Stripe portal error: {e}")
        return jsonify({'error': 'Failed to create portal session'}), 500
    except Exception as e:
        logger.error(f"Portal error: {e}")
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/status', methods=['GET'])
@require_auth
def billing_status():
    """
    Get the user's current billing/plan status.

    Returns:
        JSON with plan, stripe_customer_id, and subscription_status.
    """
    try:
        user_id = request.user_id
        user = User.get_by_id(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        result = {
            'plan': user.get('plan', 'free'),
            'stripe_customer_id': user.get('stripe_customer_id'),
            'subscription_status': None,
        }

        # Fetch subscription status from Stripe if subscription exists
        sub_id = user.get('stripe_subscription_id')
        if sub_id:
            try:
                stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
                subscription = stripe.Subscription.retrieve(sub_id)
                result['subscription_status'] = subscription.status
            except stripe.StripeError:
                result['subscription_status'] = 'unknown'

        return jsonify(result)

    except Exception as e:
        logger.error(f"Billing status error: {e}")
        return jsonify({'error': str(e)}), 500


@billing_bp.route('/webhook', methods=['POST'])
def stripe_webhook():
    """
    Handle Stripe webhook events for subscription lifecycle.

    Events handled:
        - checkout.session.completed: Upgrade to pro
        - customer.subscription.updated: Handle status changes
        - customer.subscription.deleted: Downgrade to free
        - invoice.payment_failed: Log warning
    """
    payload = request.get_data()
    sig_header = request.headers.get('Stripe-Signature')
    webhook_secret = os.getenv('STRIPE_WEBHOOK_SECRET')

    # Verify signature if webhook secret is configured
    if webhook_secret:
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
        except ValueError:
            logger.error("Webhook: invalid payload")
            return jsonify({'error': 'Invalid payload'}), 400
        except stripe.SignatureVerificationError:
            logger.error("Webhook: invalid signature")
            return jsonify({'error': 'Invalid signature'}), 400
    else:
        # Development mode — no signature verification
        import json
        event = stripe.Event.construct_from(json.loads(payload), stripe.api_key)
        logger.warning("Webhook: no STRIPE_WEBHOOK_SECRET set, skipping signature verification")

    event_type = event.type
    data = event.data.object

    logger.info(f"Webhook received: {event_type}")

    try:
        if event_type == 'checkout.session.completed':
            _handle_checkout_completed(data)
        elif event_type == 'customer.subscription.updated':
            _handle_subscription_updated(data)
        elif event_type == 'customer.subscription.deleted':
            _handle_subscription_deleted(data)
        elif event_type == 'invoice.payment_failed':
            _handle_payment_failed(data)
        else:
            logger.info(f"Webhook: unhandled event type {event_type}")
    except Exception as e:
        logger.error(f"Webhook handler error for {event_type}: {e}")
        # Return 200 anyway to prevent Stripe from retrying
        return jsonify({'error': str(e)}), 200

    return jsonify({'received': True}), 200


def _handle_checkout_completed(session) -> None:
    """Handle successful checkout — upgrade user to pro."""
    customer_id = session.get('customer')
    subscription_id = session.get('subscription')
    user_id = (session.get('metadata') or {}).get('user_id')

    # Look up user by metadata first, then by Stripe customer ID
    user = None
    if user_id:
        user = User.get_by_id(user_id)
    if not user and customer_id:
        user = User.get_by_stripe_customer_id(customer_id)

    if not user:
        logger.error(f"Webhook: checkout completed but user not found (customer={customer_id})")
        return

    User.update_plan(user['id'], 'pro', stripe_subscription_id=subscription_id)
    logger.info(f"User {user['id']} upgraded to pro (subscription={subscription_id})")


def _handle_subscription_updated(subscription) -> None:
    """Handle subscription status changes."""
    customer_id = subscription.get('customer')
    status = subscription.get('status')

    user = User.get_by_stripe_customer_id(customer_id)
    if not user:
        logger.error(f"Webhook: subscription updated but user not found (customer={customer_id})")
        return

    if status == 'active':
        User.update_plan(user['id'], 'pro', stripe_subscription_id=subscription.get('id'))
    elif status in ('canceled', 'unpaid', 'past_due'):
        User.update_plan(user['id'], 'free')

    logger.info(f"User {user['id']} subscription status: {status}")


def _handle_subscription_deleted(subscription) -> None:
    """Handle subscription cancellation — downgrade to free."""
    customer_id = subscription.get('customer')

    user = User.get_by_stripe_customer_id(customer_id)
    if not user:
        logger.error(f"Webhook: subscription deleted but user not found (customer={customer_id})")
        return

    User.update_plan(user['id'], 'free')
    logger.info(f"User {user['id']} downgraded to free (subscription canceled)")


def _handle_payment_failed(invoice) -> None:
    """Handle payment failure — log warning, don't immediately downgrade."""
    customer_id = invoice.get('customer')
    logger.warning(f"Payment failed for customer {customer_id}. Stripe will retry automatically.")
