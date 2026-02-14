# ML Calendar Classifier Implementation Guide

## Overview

This document describes how to add ML-based calendar classification to the existing system as an optimization layer on top of the current LLM-based approach with pattern discovery.

**Current State:**
- ✅ LLM generates calendar descriptions via pattern discovery
- ✅ Agent 3 uses LLM to classify events based on descriptions
- ✅ Incremental pattern refresh keeps descriptions up-to-date

**Goal:**
- Add fast ML classifier trained on user's actual calendar assignments
- Keep LLM descriptions as fallback and for UI/explainability
- Hybrid approach: ML for speed/consistency, LLM for edge cases

---

## Architecture Overview

### Current Flow
```
New Event
    ↓
Agent 3 (LLM Classification)
    - Reads calendar descriptions (from pattern discovery)
    - Decides which calendar
    - ~500ms, ~$0.001 per event
    ↓
Assigned Calendar
```

### New Flow (Hybrid)
```
New Event
    ↓
ML Classifier (if trained)
    - Predict calendar from learned patterns
    - <10ms, $0 per event
    - Confidence threshold: 0.85
    ↓
High Confidence? ─── Yes ──→ Assigned Calendar
    │
    No (or not trained)
    ↓
Agent 3 (LLM Fallback)
    - Use calendar descriptions
    - ~500ms, ~$0.001
    ↓
Assigned Calendar
```

---

## Implementation Plan

### Phase 1: Core Classifier Infrastructure

#### 1.1: Create Database Schema

**New table: `calendar_classifiers`**

```sql
CREATE TABLE calendar_classifiers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Model metadata
    model_version VARCHAR(50) NOT NULL,  -- e.g., "v1_gradient_boost"
    training_date TIMESTAMP NOT NULL,
    events_trained_on INTEGER NOT NULL,
    
    -- Serialized model
    model_data BYTEA NOT NULL,  -- Pickled sklearn model
    label_encoder BYTEA NOT NULL,  -- Pickled LabelEncoder
    
    -- Performance metrics
    train_accuracy FLOAT,
    cross_val_score FLOAT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(user_id, is_active)  -- Only one active model per user
);

CREATE INDEX idx_calendar_classifiers_user ON calendar_classifiers(user_id);
CREATE INDEX idx_calendar_classifiers_active ON calendar_classifiers(user_id, is_active);
```

**Add to existing `users` table:**

```sql
ALTER TABLE users ADD COLUMN ml_classifier_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN ml_classifier_last_trained TIMESTAMP;
ALTER TABLE users ADD COLUMN ml_classifier_event_count INTEGER DEFAULT 0;
```

---

#### 1.2: Create Classifier Service

**New file: `backend/ml/calendar_classifier_service.py`**

```python
"""
ML-based calendar classification service.

Trains per-user classifiers on calendar assignment history.
Provides fast, consistent predictions with confidence scores.
"""

import pickle
import logging
from typing import Optional, Tuple, Dict, List
from datetime import datetime
import numpy as np

from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import cross_val_score
from sklearn.metrics import accuracy_score

logger = logging.getLogger(__name__)


class CalendarClassifierService:
    """
    Manages training and inference for per-user calendar classifiers.
    """
    
    # Minimum events needed to train
    MIN_TRAINING_EVENTS = 50
    
    # Minimum events per calendar for balanced training
    MIN_EVENTS_PER_CALENDAR = 10
    
    # Confidence threshold for using ML prediction
    CONFIDENCE_THRESHOLD = 0.85
    
    # Model version (increment when changing features/model)
    MODEL_VERSION = "v1_gradient_boost"
    
    def __init__(self):
        self.embedding_service = None  # TODO: Initialize embedding service
    
    def can_train(self, user_id: str) -> Tuple[bool, str]:
        """
        Check if user has enough data to train a classifier.
        
        Returns:
            (can_train, reason)
        """
        from database.models import Event
        
        # Get user's events with calendar assignments
        events = Event.get_by_user(user_id, limit=1000)
        
        if len(events) < self.MIN_TRAINING_EVENTS:
            return False, f"Need {self.MIN_TRAINING_EVENTS} events, have {len(events)}"
        
        # Check calendar distribution
        calendar_counts = {}
        for event in events:
            cal_id = event.get('calendar_id') or event.get('provider_calendar_id')
            if cal_id:
                calendar_counts[cal_id] = calendar_counts.get(cal_id, 0) + 1
        
        if len(calendar_counts) < 2:
            return False, "Need at least 2 calendars to classify"
        
        # Check minimum events per calendar
        for cal_id, count in calendar_counts.items():
            if count < self.MIN_EVENTS_PER_CALENDAR:
                return False, f"Calendar {cal_id} has only {count} events (need {self.MIN_EVENTS_PER_CALENDAR})"
        
        return True, f"Ready to train on {len(events)} events across {len(calendar_counts)} calendars"
    
    def extract_features(self, event: Dict) -> Dict[str, any]:
        """
        Extract features from event for classification.
        
        Features:
        - Temporal: hour, day_of_week, is_weekend, duration
        - Text: title embedding (1536-dim), title length, keywords
        - Location: location embedding (1536-dim), location type
        - Social: number of attendees, has attendees
        
        Returns:
            Dict with feature values
        """
        from datetime import datetime
        
        # Parse start time
        start = event.get('start')
        if isinstance(start, dict):
            start_str = start.get('dateTime') or start.get('date')
        else:
            start_str = start
        
        try:
            start_dt = datetime.fromisoformat(start_str.replace('Z', '+00:00'))
        except:
            start_dt = datetime.now()
        
        # Temporal features
        hour = start_dt.hour
        day_of_week = start_dt.weekday()
        is_weekend = day_of_week >= 5
        
        # Duration
        duration_minutes = event.get('duration_minutes')
        if not duration_minutes:
            end = event.get('end')
            if isinstance(end, dict):
                end_str = end.get('dateTime') or end.get('date')
            else:
                end_str = end
            
            try:
                end_dt = datetime.fromisoformat(end_str.replace('Z', '+00:00'))
                duration_minutes = int((end_dt - start_dt).total_seconds() / 60)
            except:
                duration_minutes = 60  # Default
        
        # Text features
        title = event.get('summary') or event.get('title') or ""
        title_length = len(title)
        title_word_count = len(title.split())
        
        # Keywords (simple boolean features)
        title_lower = title.lower()
        has_meeting = 'meeting' in title_lower or 'call' in title_lower
        has_social = any(w in title_lower for w in ['dinner', 'lunch', 'coffee', 'party', 'drinks'])
        has_class = any(w in title_lower for w in ['lecture', 'class', 'seminar', 'lab'])
        has_work = any(w in title_lower for w in ['work', 'project', 'deadline', 'review'])
        
        # Location features
        location = event.get('location') or ""
        is_virtual = any(w in location.lower() for w in ['zoom', 'meet', 'teams', 'virtual'])
        has_location = bool(location)
        
        # Social features
        attendees = event.get('attendees') or []
        num_attendees = len(attendees)
        has_attendees = num_attendees > 0
        
        features = {
            # Temporal
            'hour': hour,
            'day_of_week': day_of_week,
            'is_weekend': int(is_weekend),
            'duration_minutes': duration_minutes,
            
            # Text
            'title_length': title_length,
            'title_word_count': title_word_count,
            'has_meeting': int(has_meeting),
            'has_social': int(has_social),
            'has_class': int(has_class),
            'has_work': int(has_work),
            
            # Location
            'is_virtual': int(is_virtual),
            'has_location': int(has_location),
            
            # Social
            'num_attendees': num_attendees,
            'has_attendees': int(has_attendees),
        }
        
        # TODO: Add embeddings when ready
        # title_embedding = self.embedding_service.get_embedding(title)
        # features.update({f'title_emb_{i}': v for i, v in enumerate(title_embedding)})
        
        return features
    
    def train(self, user_id: str) -> Optional[str]:
        """
        Train a new classifier for the user.
        
        Returns:
            classifier_id if successful, None otherwise
        """
        from database.models import Event, User
        
        logger.info(f"Starting classifier training for user {user_id[:8]}")
        
        # Check if training is possible
        can_train, reason = self.can_train(user_id)
        if not can_train:
            logger.info(f"Cannot train classifier for {user_id[:8]}: {reason}")
            return None
        
        # Fetch events
        events = Event.get_by_user(user_id, limit=1000)
        
        # Extract features and labels
        X = []
        y = []
        
        for event in events:
            # Get calendar assignment (label)
            calendar_id = event.get('calendar_id') or event.get('provider_calendar_id')
            if not calendar_id:
                continue
            
            # Extract features
            features = self.extract_features(event)
            
            # Convert to feature vector
            feature_vector = [
                features['hour'],
                features['day_of_week'],
                features['is_weekend'],
                features['duration_minutes'],
                features['title_length'],
                features['title_word_count'],
                features['has_meeting'],
                features['has_social'],
                features['has_class'],
                features['has_work'],
                features['is_virtual'],
                features['has_location'],
                features['num_attendees'],
                features['has_attendees'],
            ]
            
            X.append(feature_vector)
            y.append(calendar_id)
        
        X = np.array(X)
        
        # Encode labels
        label_encoder = LabelEncoder()
        y_encoded = label_encoder.fit_transform(y)
        
        # Train model
        model = GradientBoostingClassifier(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.1,
            random_state=42
        )
        
        model.fit(X, y_encoded)
        
        # Evaluate
        train_accuracy = accuracy_score(y_encoded, model.predict(X))
        cv_score = cross_val_score(model, X, y_encoded, cv=5).mean()
        
        logger.info(
            f"Classifier trained for {user_id[:8]}: "
            f"train_acc={train_accuracy:.3f}, cv_score={cv_score:.3f}"
        )
        
        # Serialize model
        model_data = pickle.dumps(model)
        encoder_data = pickle.dumps(label_encoder)
        
        # Save to database
        from database.models import CalendarClassifier
        
        classifier_id = CalendarClassifier.create(
            user_id=user_id,
            model_version=self.MODEL_VERSION,
            training_date=datetime.utcnow(),
            events_trained_on=len(events),
            model_data=model_data,
            label_encoder=encoder_data,
            train_accuracy=train_accuracy,
            cross_val_score=cv_score
        )
        
        # Update user record
        User.update(user_id, {
            'ml_classifier_enabled': True,
            'ml_classifier_last_trained': datetime.utcnow(),
            'ml_classifier_event_count': len(events)
        })
        
        logger.info(f"Classifier saved for user {user_id[:8]}: {classifier_id}")
        
        return classifier_id
    
    def predict(self, user_id: str, event: Dict) -> Tuple[Optional[str], float, str]:
        """
        Predict calendar for an event.
        
        Returns:
            (calendar_id, confidence, method)
            method is "ml_high_conf", "ml_low_conf", or None
        """
        from database.models import CalendarClassifier
        
        # Load classifier
        classifier_data = CalendarClassifier.get_active(user_id)
        if not classifier_data:
            return None, 0.0, None
        
        # Deserialize
        model = pickle.loads(classifier_data['model_data'])
        label_encoder = pickle.loads(classifier_data['label_encoder'])
        
        # Extract features
        features = self.extract_features(event)
        
        feature_vector = np.array([[
            features['hour'],
            features['day_of_week'],
            features['is_weekend'],
            features['duration_minutes'],
            features['title_length'],
            features['title_word_count'],
            features['has_meeting'],
            features['has_social'],
            features['has_class'],
            features['has_work'],
            features['is_virtual'],
            features['has_location'],
            features['num_attendees'],
            features['has_attendees'],
        ]])
        
        # Predict
        prediction_encoded = model.predict(feature_vector)[0]
        probabilities = model.predict_proba(feature_vector)[0]
        
        calendar_id = label_encoder.inverse_transform([prediction_encoded])[0]
        confidence = float(max(probabilities))
        
        method = "ml_high_conf" if confidence >= self.CONFIDENCE_THRESHOLD else "ml_low_conf"
        
        return calendar_id, confidence, method
    
    def should_retrain(self, user_id: str) -> bool:
        """
        Check if classifier should be retrained.
        
        Retrain if:
        - Never trained before
        - Last trained >30 days ago
        - User added 50+ events since last training
        """
        from database.models import User
        
        user = User.get_by_id(user_id)
        if not user:
            return False
        
        last_trained = user.get('ml_classifier_last_trained')
        if not last_trained:
            # Never trained
            can_train, _ = self.can_train(user_id)
            return can_train
        
        # Check time since last training
        days_since = (datetime.utcnow() - last_trained).days
        if days_since > 30:
            return True
        
        # Check new events since training
        events_at_training = user.get('ml_classifier_event_count', 0)
        from database.models import Event
        current_events = len(Event.get_by_user(user_id, limit=1000))
        
        new_events = current_events - events_at_training
        if new_events >= 50:
            return True
        
        return False
```

---

#### 1.3: Create Database Models

**Add to `backend/database/models.py`:**

```python
class CalendarClassifier:
    """Database model for ML calendar classifiers."""
    
    @staticmethod
    def create(
        user_id: str,
        model_version: str,
        training_date: datetime,
        events_trained_on: int,
        model_data: bytes,
        label_encoder: bytes,
        train_accuracy: float,
        cross_val_score: float
    ) -> str:
        """Create new classifier, deactivating old ones."""
        from database.connection import get_db_connection
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Deactivate old classifiers
        cur.execute(
            "UPDATE calendar_classifiers SET is_active = false WHERE user_id = %s",
            (user_id,)
        )
        
        # Insert new classifier
        cur.execute("""
            INSERT INTO calendar_classifiers 
            (user_id, model_version, training_date, events_trained_on,
             model_data, label_encoder, train_accuracy, cross_val_score)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            user_id, model_version, training_date, events_trained_on,
            model_data, label_encoder, train_accuracy, cross_val_score
        ))
        
        classifier_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        
        return classifier_id
    
    @staticmethod
    def get_active(user_id: str) -> Optional[Dict]:
        """Get active classifier for user."""
        from database.connection import get_db_connection
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT id, model_version, training_date, events_trained_on,
                   model_data, label_encoder, train_accuracy, cross_val_score
            FROM calendar_classifiers
            WHERE user_id = %s AND is_active = true
            LIMIT 1
        """, (user_id,))
        
        row = cur.fetchone()
        cur.close()
        
        if not row:
            return None
        
        return {
            'id': row[0],
            'model_version': row[1],
            'training_date': row[2],
            'events_trained_on': row[3],
            'model_data': row[4],
            'label_encoder': row[5],
            'train_accuracy': row[6],
            'cross_val_score': row[7]
        }
```

---

### Phase 2: Integration with Existing System

#### 2.1: Add Hybrid Calendar Assignment

**Modify `backend/preferences/agent.py` (Agent 3):**

```python
from ml.calendar_classifier_service import CalendarClassifierService

class PreferencesAgent:
    def __init__(self, ...):
        # ... existing init
        self.calendar_classifier = CalendarClassifierService()
    
    def _assign_calendar(self, event: Dict, user_id: str, calendars: List[Dict]) -> Tuple[str, str]:
        """
        Assign calendar using hybrid approach:
        1. Try ML classifier (if trained and confident)
        2. Fall back to LLM with descriptions
        
        Returns:
            (calendar_id, assignment_method)
        """
        
        # Try ML classifier first
        calendar_id, confidence, method = self.calendar_classifier.predict(user_id, event)
        
        if method == "ml_high_conf":
            logger.info(
                f"ML classifier assigned calendar {calendar_id} "
                f"with confidence {confidence:.3f}"
            )
            return calendar_id, "ml_classifier"
        
        # ML not available or low confidence - use LLM
        if method == "ml_low_conf":
            logger.info(
                f"ML confidence too low ({confidence:.3f}), "
                f"falling back to LLM"
            )
        
        # Existing LLM-based calendar assignment
        calendar_id = self._llm_assign_calendar(event, calendars)
        
        return calendar_id, "llm_fallback"
    
    def _llm_assign_calendar(self, event: Dict, calendars: List[Dict]) -> str:
        """
        Existing LLM-based calendar assignment logic.
        Uses calendar descriptions from pattern discovery.
        """
        # ... existing implementation
        pass
```

---

#### 2.2: Add Training Triggers

**Create `backend/ml/training_scheduler.py`:**

```python
"""
Background training scheduler for ML classifiers.

Monitors users and triggers training when:
- User reaches 50+ events (initial training)
- 30+ days since last training
- 50+ new events since last training
"""

import logging
from datetime import datetime, timedelta
from typing import List

from ml.calendar_classifier_service import CalendarClassifierService
from database.models import User

logger = logging.getLogger(__name__)


class ClassifierTrainingScheduler:
    """Manages background training of user classifiers."""
    
    def __init__(self):
        self.classifier_service = CalendarClassifierService()
    
    def find_users_needing_training(self) -> List[str]:
        """
        Find users who need classifier training.
        
        Returns:
            List of user IDs
        """
        users = User.get_all_active()
        
        needs_training = []
        
        for user in users:
            user_id = user['id']
            
            if self.classifier_service.should_retrain(user_id):
                needs_training.append(user_id)
        
        return needs_training
    
    def train_user(self, user_id: str) -> bool:
        """
        Train classifier for a single user.
        
        Returns:
            True if training succeeded
        """
        try:
            logger.info(f"Training classifier for user {user_id[:8]}")
            
            classifier_id = self.classifier_service.train(user_id)
            
            if classifier_id:
                logger.info(f"Successfully trained classifier for {user_id[:8]}")
                return True
            else:
                logger.info(f"Training not ready for {user_id[:8]}")
                return False
        
        except Exception as e:
            logger.error(f"Training failed for {user_id[:8]}: {e}", exc_info=True)
            return False
    
    def run_training_batch(self, max_users: int = 10) -> Dict:
        """
        Train classifiers for batch of users.
        
        Args:
            max_users: Maximum users to train in this batch
        
        Returns:
            Dict with success/failure counts
        """
        users = self.find_users_needing_training()[:max_users]
        
        if not users:
            logger.info("No users need training")
            return {'total': 0, 'success': 0, 'failed': 0}
        
        logger.info(f"Training classifiers for {len(users)} users")
        
        results = {'total': len(users), 'success': 0, 'failed': 0}
        
        for user_id in users:
            if self.train_user(user_id):
                results['success'] += 1
            else:
                results['failed'] += 1
        
        logger.info(
            f"Training batch complete: "
            f"{results['success']} succeeded, {results['failed']} failed"
        )
        
        return results


# Celery task for background training
def train_classifiers_task():
    """Celery task to run training scheduler."""
    scheduler = ClassifierTrainingScheduler()
    return scheduler.run_training_batch(max_users=10)
```

**Add to Celery beat schedule:**

```python
# In backend/config/celery.py or wherever celery is configured

from celery.schedules import crontab

app.conf.beat_schedule = {
    # ... existing tasks
    
    'train-calendar-classifiers': {
        'task': 'ml.training_scheduler.train_classifiers_task',
        'schedule': crontab(hour=3, minute=0),  # Run daily at 3am
    },
}
```

---

### Phase 3: Monitoring & Observability

#### 3.1: Add Tracking

**Track assignment method in PostHog/analytics:**

```python
# In preferences/agent.py after calendar assignment

from config.posthog import capture_event

calendar_id, method = self._assign_calendar(event, user_id, calendars)

# Track which method was used
capture_event(
    user_id,
    "calendar_assigned",
    {
        "calendar_id": calendar_id,
        "assignment_method": method,  # "ml_classifier" or "llm_fallback"
        "event_type": event.get('summary', '')[:50]
    }
)
```

#### 3.2: Add Metrics

**Track key metrics:**

- ML classifier usage rate (% events using ML vs LLM)
- Confidence distribution (histogram of ML confidence scores)
- Training success rate
- Time saved (ML vs LLM latency)
- Cost saved (no LLM calls for ML predictions)

**Dashboard queries:**

```sql
-- ML usage rate
SELECT 
    assignment_method,
    COUNT(*) as count,
    COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
FROM events_log
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY assignment_method;

-- Training stats
SELECT 
    COUNT(*) as total_users_with_classifiers,
    AVG(train_accuracy) as avg_train_accuracy,
    AVG(cross_val_score) as avg_cv_score,
    AVG(events_trained_on) as avg_training_size
FROM calendar_classifiers
WHERE is_active = true;
```

---

### Phase 4: Iteration & Improvement

#### 4.1: Add Title Embeddings (Optional Enhancement)

**When ready to add semantic features:**

```python
# In CalendarClassifierService.extract_features()

# Get title embedding (1536-dim from OpenAI)
title_embedding = self.embedding_service.get_embedding(event.get('summary', ''))

# Add to feature vector
features.update({
    f'title_emb_{i}': v 
    for i, v in enumerate(title_embedding)
})
```

**Benefits:**
- Captures semantic similarity ("team sync" ≈ "standup")
- Better generalization to new event types
- Reduces need for keyword features

**Tradeoffs:**
- Increases feature dimensionality (14 → 1550 features)
- Requires embedding service
- Slightly longer training time

---

#### 4.2: Add User Feedback Loop

**Track when users manually correct calendar assignments:**

```python
# When user moves event to different calendar

from database.models import CalendarClassifier

CalendarClassifier.record_correction(
    user_id=user_id,
    event_id=event_id,
    predicted_calendar=old_calendar_id,
    actual_calendar=new_calendar_id,
    assignment_method=method  # Was it ML or LLM that got it wrong?
)

# Trigger retraining if many corrections
if CalendarClassifier.get_correction_count(user_id) > 10:
    schedule_retraining(user_id)
```

---

### Phase 5: Testing & Validation

#### 5.1: Unit Tests

**Test file: `tests/ml/test_calendar_classifier.py`**

```python
import pytest
from ml.calendar_classifier_service import CalendarClassifierService

def test_feature_extraction():
    """Test that features are extracted correctly"""
    service = CalendarClassifierService()
    
    event = {
        'summary': 'Team Meeting',
        'start': '2024-02-15T14:00:00Z',
        'end': '2024-02-15T15:00:00Z',
        'location': 'Zoom',
        'attendees': ['alice@example.com', 'bob@example.com']
    }
    
    features = service.extract_features(event)
    
    assert features['hour'] == 14
    assert features['day_of_week'] == 3  # Thursday
    assert features['has_meeting'] == 1
    assert features['is_virtual'] == 1
    assert features['num_attendees'] == 2

def test_can_train_insufficient_data():
    """Test that training is blocked with insufficient data"""
    service = CalendarClassifierService()
    
    # Mock user with only 10 events
    can_train, reason = service.can_train('user_id')
    
    assert can_train == False
    assert "Need 50 events" in reason

def test_predict_no_classifier():
    """Test prediction when no classifier exists"""
    service = CalendarClassifierService()
    
    event = {'summary': 'Test Event'}
    
    calendar_id, confidence, method = service.predict('user_id', event)
    
    assert calendar_id is None
    assert confidence == 0.0
    assert method is None
```

---

#### 5.2: Integration Tests

**Test file: `tests/integration/test_hybrid_calendar_assignment.py`**

```python
def test_hybrid_assignment_ml_high_confidence(setup_user_with_classifier):
    """Test that ML is used when confidence is high"""
    user_id = setup_user_with_classifier
    
    event = {
        'summary': 'CS180 Lecture',
        'start': '2024-02-15T10:00:00Z',
        'end': '2024-02-15T11:00:00Z'
    }
    
    agent = PreferencesAgent()
    calendar_id, method = agent._assign_calendar(event, user_id, calendars=[])
    
    assert method == "ml_classifier"
    assert calendar_id == "school_calendar_id"

def test_hybrid_assignment_ml_low_confidence_fallback(setup_user_with_classifier):
    """Test that LLM is used when ML confidence is low"""
    user_id = setup_user_with_classifier
    
    # Ambiguous event
    event = {
        'summary': 'Meeting',
        'start': '2024-02-15T14:00:00Z',
        'end': '2024-02-15T15:00:00Z'
    }
    
    agent = PreferencesAgent()
    calendar_id, method = agent._assign_calendar(event, user_id, calendars=[])
    
    # Should fall back to LLM due to low confidence
    assert method == "llm_fallback"
```

---

#### 5.3: A/B Test Plan

**When ready to validate improvement:**

1. **Split users into cohorts:**
   - Control: LLM-only (existing)
   - Treatment: Hybrid ML + LLM

2. **Track metrics:**
   - Assignment accuracy (via user corrections)
   - Latency (p50, p95, p99)
   - Cost per event
   - User satisfaction

3. **Success criteria:**
   - ML accuracy ≥ 90% (of events it handles)
   - Latency improvement ≥ 50%
   - Cost reduction ≥ 60%
   - No significant accuracy degradation

---

## Dependencies

**Add to `requirements.txt`:**

```
scikit-learn==1.3.0
numpy==1.24.3
```

---

## Migration Plan

### Week 1: Infrastructure
- [ ] Create database schema
- [ ] Implement CalendarClassifierService
- [ ] Add database models
- [ ] Write unit tests

### Week 2: Integration
- [ ] Integrate with Agent 3
- [ ] Add training scheduler
- [ ] Set up Celery task
- [ ] Add tracking/metrics

### Week 3: Testing
- [ ] Integration tests
- [ ] Manual testing with real users
- [ ] Performance benchmarking

### Week 4: Rollout
- [ ] Enable for 10% of users
- [ ] Monitor metrics
- [ ] Fix issues
- [ ] Gradual rollout to 100%

---

## Rollback Plan

**If ML classifier causes issues:**

1. **Disable ML classification globally:**
   ```python
   # Add feature flag
   ENABLE_ML_CALENDAR_CLASSIFIER = False
   ```

2. **System reverts to 100% LLM-based assignment**

3. **No data loss** - LLM descriptions still exist

4. **Investigate & fix issues**

5. **Re-enable when ready**

---

## Success Metrics

### Performance Targets

| Metric | Current (LLM) | Target (ML) | Improvement |
|--------|--------------|-------------|-------------|
| Latency (p50) | 500ms | <10ms | 50x faster |
| Cost per event | $0.001 | $0.0001 | 10x cheaper |
| Accuracy | ~90% | ≥90% | Same or better |
| Coverage | 100% | 85-90% | ML handles most |

### Business Impact

**At 10,000 active users:**
- **Events per month:** 10,000 users × 20 events = 200,000 events
- **ML handles:** 85% = 170,000 events
- **Cost savings:** 170,000 × $0.0009 = **$153/month**
- **Latency savings:** 170,000 × 490ms = **23 hours of compute time**

**At scale (100,000 users):**
- **Cost savings:** **$1,530/month** = **$18,360/year**
- **Latency savings:** Significantly better UX

---

## Future Enhancements

### Phase 6: Advanced Features

1. **Multi-model ensemble:**
   - Combine GradientBoosting + Neural Network
   - Vote between models for higher accuracy

2. **Active learning:**
   - Prioritize training on events where models disagree
   - Learn faster from user corrections

3. **Transfer learning:**
   - Use patterns from similar users (anonymized)
   - Cold start problem solved

4. **Contextual features:**
   - Time of year (semester, holidays)
   - User's recent calendar density
   - Event series detection

---

## FAQ

### Q: When should users get ML classifier?
**A:** After 50+ events and at least 2 calendars with 10+ events each.

### Q: What if ML confidence is too low?
**A:** Seamlessly fall back to existing LLM-based assignment. User never knows.

### Q: Do we lose LLM descriptions?
**A:** No! Pattern discovery still runs. Descriptions used for:
- LLM fallback
- UI display ("What is this calendar for?")
- Edge cases

### Q: What about new event types?
**A:** ML will have low confidence → LLM handles it → ML learns from it next training.

### Q: How often to retrain?
**A:** Daily check, retrain if:
- 30+ days since last training, OR
- 50+ new events since last training

### Q: What if user changes calendar structure?
**A:** Next training (within 24h) will pick up new patterns.

---

## Conclusion

This implementation adds ML-based calendar classification as an optimization layer on top of your existing sophisticated pattern discovery system. It's a true hybrid approach that leverages the best of both worlds:

- **ML:** Fast, consistent, cheap for common cases
- **LLM:** Flexible, explainable, handles edge cases

The system degrades gracefully (LLM fallback) and improves over time (retraining on user data).

**Start simple, iterate, measure, improve.**
