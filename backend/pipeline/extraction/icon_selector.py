"""
Icon Selector — picks a Phosphor icon via semantic similarity.

Uses sentence-transformers (all-MiniLM-L6-v2) to embed the input text and
compare against pre-computed category embeddings.  Much more robust than
keyword matching: "fly to NYC" correctly matches the airplane icon even
though the exact word "flight" never appears.
"""

import logging
import numpy as np
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Icon categories: icon name → list of representative phrases.
# These are embedded once at init time.  Richer descriptions = better matching.
# ---------------------------------------------------------------------------
ICON_CATEGORIES: dict[str, list[str]] = {
    # Food & Dining
    "fork-knife": [
        "dinner at a restaurant", "lunch meeting", "brunch with friends",
        "going out to eat", "meal reservation", "food and dining",
    ],
    "coffee": [
        "coffee meeting", "cafe hangout", "grabbing a latte",
        "espresso break", "starbucks run",
    ],
    "beer-bottle": [
        "drinks at a bar", "happy hour", "brewery visit", "pub night",
        "going out for beers",
    ],
    "wine": [
        "wine tasting", "winery visit", "vineyard tour",
    ],
    "cooking-pot": [
        "cooking dinner", "baking at home", "potluck gathering",
        "recipe night", "meal prep",
    ],
    "cake": [
        "birthday party", "birthday celebration", "cake and dessert",
    ],
    "bowl-food": [
        "breakfast in the morning", "cereal and oatmeal",
        "ramen lunch", "poke bowl",
    ],

    # Travel & Transportation
    "airplane-tilt": [
        "flight to another city", "flying somewhere", "airplane travel",
        "airport departure", "booking a flight", "airline trip",
        "vacation travel abroad", "fly to New York",
    ],
    "car": [
        "driving somewhere", "road trip", "carpool to work",
        "uber ride", "lyft pickup", "commute by car",
    ],
    "train": [
        "train ride", "metro commute", "subway trip",
        "amtrak travel", "rail transit",
    ],
    "bus": [
        "bus ride", "shuttle to airport", "public transit bus",
    ],
    "boat": [
        "boat trip", "cruise vacation", "sailing adventure",
        "ferry crossing", "yacht party",
    ],
    "tent": [
        "camping trip", "tent outdoors", "glamping weekend",
        "campfire night",
    ],
    "map-trifold": [
        "following directions", "navigating a route", "sightseeing tour",
        "exploring a new city",
    ],
    "suitcase-rolling": [
        "packing luggage", "hotel check-in", "hostel booking",
        "travel packing",
    ],
    "bed": [
        "hotel stay", "airbnb accommodation", "lodging overnight",
        "sleeping at a hotel",
    ],

    # Fitness & Health
    "barbell": [
        "gym workout", "lifting weights", "strength training",
        "crossfit session", "weightlifting",
    ],
    "person-simple-run": [
        "going for a run", "jogging in the park", "marathon training",
        "running a 5k race",
    ],
    "bicycle": [
        "bike ride", "cycling workout", "peloton session",
        "biking around town",
    ],
    "swimming-pool": [
        "swimming laps", "pool workout", "swim practice",
    ],
    "heart": [
        "wellness check", "self-care day", "meditation session",
        "mindfulness practice", "mental health",
    ],
    "first-aid-kit": [
        "doctor appointment", "medical checkup", "dentist visit",
        "therapy session", "clinic visit", "hospital appointment",
        "physical exam", "counseling session",
    ],
    "pill": [
        "pharmacy pickup", "prescription refill", "medication reminder",
    ],
    "basketball": [
        "basketball game", "pickup basketball", "NBA game",
    ],
    "soccer-ball": [
        "soccer match", "football game", "FIFA tournament",
    ],
    "tennis-ball": [
        "tennis match", "playing tennis", "racket sports",
    ],

    # Work & Office
    "briefcase": [
        "work at the office", "business meeting", "corporate event",
        "job interview", "career fair",
    ],
    "presentation-chart": [
        "giving a presentation", "pitch meeting", "demo day",
        "powerpoint slides", "keynote presentation",
    ],
    "video-camera": [
        "video call", "zoom meeting", "teams call",
        "webinar", "live stream", "recording session",
    ],
    "users": [
        "team meeting", "standup sync", "group huddle",
        "one-on-one meeting", "all-hands meeting", "1:1 with manager",
    ],
    "chats": [
        "interview discussion", "casual chat", "catching up with someone",
        "conversation with a friend",
    ],
    "envelope-simple": [
        "sending an email", "newsletter", "mailing something",
    ],
    "phone": [
        "phone call", "calling someone", "conference call",
        "dial-in meeting",
    ],
    "desktop-tower": [
        "hackathon event", "coding session", "programming sprint",
        "software deployment", "release day",
    ],
    "handshake": [
        "networking event", "mixer social", "meeting new people",
        "professional introduction",
    ],

    # Education
    "graduation-cap": [
        "graduation ceremony", "commencement", "receiving a degree",
        "diploma ceremony",
    ],
    "book-open": [
        "attending a class", "lecture at school", "course session",
        "study session", "reading assignment", "homework time",
    ],
    "exam": [
        "taking an exam", "midterm test", "final exam",
        "quiz assessment",
    ],
    "chalkboard-teacher": [
        "teaching a class", "tutoring session", "office hours with professor",
        "recitation section",
    ],
    "student": [
        "school event", "university campus", "college activity",
        "academic semester", "student club",
    ],
    "notebook": [
        "taking notes", "journal writing", "essay deadline",
        "paper submission", "lab report",
    ],

    # Entertainment & Social
    "music-notes": [
        "concert tickets", "live music show", "music festival",
        "band performance", "orchestra recital", "symphony night",
    ],
    "ticket": [
        "event tickets", "admission to a show", "ticketed event",
    ],
    "film-slate": [
        "watching a movie", "film screening", "cinema night",
        "theater premiere",
    ],
    "television": [
        "watching TV", "streaming a show", "netflix binge",
        "series premiere",
    ],
    "game-controller": [
        "gaming night", "video game session", "LAN party",
        "esports tournament",
    ],
    "microphone-stage": [
        "karaoke night", "open mic event", "comedy show",
        "standup comedy", "podcast recording", "public speaking",
    ],
    "paint-brush": [
        "art class", "painting session", "gallery exhibit",
        "museum visit", "creative workshop",
    ],
    "camera": [
        "photo shoot", "photography session", "portrait session",
    ],
    "confetti": [
        "party celebration", "social gathering", "hangout with friends",
        "get-together", "house party",
    ],

    # Shopping & Errands
    "shopping-cart": [
        "grocery shopping", "going to the store", "mall shopping",
        "buying something", "market run",
    ],
    "scissors": [
        "haircut appointment", "salon visit", "barber appointment",
        "spa day", "grooming",
    ],
    "package": [
        "package delivery", "picking up a shipment", "FedEx or UPS delivery",
        "Amazon package arriving",
    ],
    "wrench": [
        "repair appointment", "maintenance service", "fixing something",
        "plumber or electrician visit", "mechanic appointment",
    ],

    # Home & Family
    "house": [
        "at home", "apartment cleaning", "moving to a new place",
        "furniture shopping",
    ],
    "baby": [
        "baby appointment", "childcare", "kids daycare",
        "babysitter coming", "pediatric visit",
    ],
    "dog": [
        "walking the dog", "pet vet appointment", "dog grooming",
        "veterinary checkup",
    ],
    "tree": [
        "gardening", "yard work", "hiking on a trail",
        "nature walk", "park visit", "landscaping",
    ],

    # Religion & Spirituality
    "church": [
        "church service", "Sunday worship", "mass at church",
        "chapel visit",
    ],
    "cross": [
        "prayer meeting", "bible study group", "religious service",
        "faith gathering",
    ],
    "star-of-david": [
        "synagogue service", "temple visit", "shabbat dinner",
    ],

    # Finance & Legal
    "bank": [
        "bank appointment", "financial planning", "investment meeting",
        "accounting session", "tax filing",
    ],
    "money": [
        "paying a bill", "invoice due", "budget review",
        "savings plan",
    ],
    "scales": [
        "lawyer meeting", "court hearing", "legal consultation",
        "notary appointment",
    ],
    "receipt": [
        "expense report", "reimbursement submission", "receipt tracking",
    ],

    # Tech & Science
    "code": [
        "coding session", "software development", "engineering work",
        "technical review",
    ],
    "robot": [
        "AI project", "machine learning work", "automation task",
        "tech meetup",
    ],
    "flask": [
        "science experiment", "lab research", "chemistry lab",
    ],

    # Celebration & Milestones
    "gift": [
        "gift shopping", "present for someone", "surprise party",
        "baby shower", "wedding registry",
    ],
    "champagne": [
        "anniversary celebration", "new year's eve party",
        "toast and cheers",
    ],
    "heart-half": [
        "date night", "romantic dinner", "valentine's day",
    ],
    "flower-lotus": [
        "wedding ceremony", "bridal shower", "engagement party",
        "reception dinner",
    ],

    # Miscellaneous
    "clock": [
        "reminder to do something", "deadline approaching",
        "timer for a task", "due date",
    ],
    "megaphone": [
        "announcement event", "rally or protest", "political campaign",
        "volunteer opportunity",
    ],
    "flag-banner": [
        "race event", "competition", "tournament bracket",
        "championship game",
    ],
}

DEFAULT_ICON = "clock"
SIMILARITY_THRESHOLD = 0.2


class IconSelector:
    """
    Selects a Phosphor icon for a session using semantic similarity.

    At init, computes a single embedding per icon category by averaging the
    embeddings of its representative phrases.  At runtime, embeds the input
    text and picks the icon whose category embedding has the highest cosine
    similarity (above a minimum threshold).
    """

    def __init__(self):
        from preferences.similarity.service import get_embedding_model

        self._model = get_embedding_model()
        self._icons: list[str] = []
        self._category_embeddings: np.ndarray = self._build_category_embeddings()

    def _build_category_embeddings(self) -> np.ndarray:
        """Pre-compute one embedding per icon category."""
        all_phrases = []
        icon_indices = []  # maps each phrase back to its icon index

        for idx, (icon, phrases) in enumerate(ICON_CATEGORIES.items()):
            self._icons.append(icon)
            for phrase in phrases:
                all_phrases.append(phrase)
                icon_indices.append(idx)

        # Batch-encode all phrases at once
        phrase_embeddings = self._model.encode(
            all_phrases, normalize_embeddings=True, show_progress_bar=False
        )

        # Average phrase embeddings per category, then L2-normalize
        n_icons = len(self._icons)
        dim = phrase_embeddings.shape[1]
        category_embeddings = np.zeros((n_icons, dim), dtype=np.float32)

        for phrase_idx, icon_idx in enumerate(icon_indices):
            category_embeddings[icon_idx] += phrase_embeddings[phrase_idx]

        # Normalize each category vector to unit length
        norms = np.linalg.norm(category_embeddings, axis=1, keepdims=True)
        norms = np.maximum(norms, 1e-10)  # avoid division by zero
        category_embeddings /= norms

        logger.info(f"Icon selector initialized: {n_icons} categories, {len(all_phrases)} phrases")
        return category_embeddings

    def select(self, text: str) -> str:
        """
        Select the best matching icon for the given text.

        Returns:
            Phosphor icon name in kebab-case (e.g., "airplane-tilt")
        """
        if not text or not text.strip():
            return DEFAULT_ICON

        # Truncate and embed
        text_embedding = self._model.encode(
            text[:2000], normalize_embeddings=True, show_progress_bar=False
        )

        # Cosine similarity (embeddings are already normalized)
        similarities = self._category_embeddings @ text_embedding

        best_idx = int(np.argmax(similarities))
        best_score = float(similarities[best_idx])

        if best_score < SIMILARITY_THRESHOLD:
            logger.debug(f"Icon selector: best score {best_score:.3f} below threshold, using default")
            return DEFAULT_ICON

        icon = self._icons[best_idx]
        logger.debug(f"Icon selector: '{icon}' (score={best_score:.3f})")
        return icon


# Singleton
_icon_selector_instance: Optional[IconSelector] = None


def get_icon_selector() -> IconSelector:
    """Get or create singleton IconSelector instance."""
    global _icon_selector_instance
    if _icon_selector_instance is None:
        _icon_selector_instance = IconSelector()
    return _icon_selector_instance