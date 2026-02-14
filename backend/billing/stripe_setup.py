"""
Stripe product and price bootstrapping.
Ensures the DropCal Pro product and price exist in Stripe. Idempotent.
"""

import os
import logging
import stripe

from config.plans import STRIPE_PRICE_CONFIG

logger = logging.getLogger(__name__)

# Module-level cache for the price ID
_pro_price_id: str | None = None


def get_pro_price_id() -> str:
    """Get the Stripe Price ID for the Pro plan."""
    if _pro_price_id is None:
        raise RuntimeError("Stripe products not initialized. Call ensure_stripe_products() first.")
    return _pro_price_id


def ensure_stripe_products() -> None:
    """
    Create Stripe products and prices if they don't exist. Idempotent.
    Called on app startup.
    """
    global _pro_price_id

    secret_key = os.getenv('STRIPE_SECRET_KEY')
    if not secret_key:
        logger.warning("STRIPE_SECRET_KEY not set — skipping Stripe product setup")
        return

    stripe.api_key = secret_key
    config = STRIPE_PRICE_CONFIG["pro"]

    try:
        # Search for existing product by metadata
        products = stripe.Product.search(
            query='metadata["app"]:"dropcal" AND metadata["plan"]:"pro"'
        )

        if products.data:
            product = products.data[0]
            logger.info(f"Found existing Stripe product: {product.id}")
        else:
            # Create the product
            product = stripe.Product.create(
                name=config["product_name"],
                metadata={"app": "dropcal", "plan": "pro"},
            )
            logger.info(f"Created Stripe product: {product.id}")

        # Find or create the price
        prices = stripe.Price.list(product=product.id, active=True)

        matching_price = None
        for price in prices.data:
            if (
                price.unit_amount == config["unit_amount"]
                and price.currency == config["currency"]
                and price.recurring
                and price.recurring.interval == config["interval"]
            ):
                matching_price = price
                break

        if matching_price:
            _pro_price_id = matching_price.id
            logger.info(f"Found existing Stripe price: {_pro_price_id}")
        else:
            price = stripe.Price.create(
                product=product.id,
                unit_amount=config["unit_amount"],
                currency=config["currency"],
                recurring={"interval": config["interval"]},
            )
            _pro_price_id = price.id
            logger.info(f"Created Stripe price: {_pro_price_id}")

    except stripe.StripeError as e:
        logger.error(f"Stripe setup failed: {e}")
        raise
