"""
Test title generation on ENGN course page
"""

from extraction.title_generator import TitleGenerator

engn_text = """
Skip To Content
Dashboard
Lucas Kover Wolf
Account
Dashboard
Courses
Groups
Calendar
19 unread messages.19
Inbox
History
Help
Spring 2026 ENGN 0520

2026 Spring
Home
Syllabus
Assignments
Grades
Zoom
Media Library
Ed Discussion
Gradescope
Homework
Labs
Lecture Notes
Files
ENGN0520 Spring26 Electrical Circuits and Signals
Welcome to ENGN 0520: Electrical Circuits and Signals!

This course is an introduction to understanding and evaluating electrical circuits and systems. These systems truly enable the modern high tech world of computing, communication, transportation, and energy. Virtually every aspect of the modern world is enabled by electrical circuits and systems.  It's our goal to give you a very good foundational knowledge of this field in this course, and enable you to explore more advanced and exciting topics in subsequent courses. This field can be very creative and even exhilarating – we hope to give you a glimpse into the fun you can have with circuits and systems.

The syllabus is here Download here.

The course calendar is here Download here. (The exact lecture topic schedule is subject to change as we move through the semester. Exam dates will not move.)

The best place to ask questions is on the ENGN 0520 Ed discussion boardLinks to an external site.!

Regular lectures: MWF 10:00AM – 10:50AM (Salomon Center 001)

In addition to the regular lectures, you should attend 1 section per week out of the four times:

C01 Tuesday 9:00 – 10:20  (B&H 751)
C02 Tuesday 1:00—2:20  (B&H 190)
C03 Thursday 9:00 – 10:20  (B&H 751)
C04 Thursday 1:00—2:20  (B&H 190)



There will be 2 in-class midterms (Feb 27, Apr 10) and a written in-person final exam (May 6).

Office/Lab Hours:  Coming soon!

Lab Reservation linkLinks to an external site.

Here Download Hereis v1.0 of some Supplementary Materials for ENGN0520 including:

Digital electronics material that we will cover in a few weeks, which is not all included in the Ulaby et al textbook.
An introduction to using LTspice
A guide to using some of the lab equipment and some items in your lab kit.
Lecture notes are here.

To Do
HW #1
ENGN0520 Spring26 Electrical Circuits and Signals
100 pointsJan 30 at 9am

Thursday Morning Section Room Change and LTSpice Demo
ENGN0520 Spring26 Electrical Circuits and Signals
Feb 4 at 2:43pm

HW #2
ENGN0520 Spring26 Electrical Circuits and Signals
100 pointsFeb 6 at 9am

Recent Feedback
Nothing for now
"""

def test_engn_page():
    print("=" * 70)
    print("TESTING: ENGN Course Page")
    print("=" * 70)
    print()

    generator = TitleGenerator()

    print("Generating title...")
    title = generator.generate(engn_text, max_words=3)

    print()
    print("=" * 70)
    print(f"GENERATED TITLE: '{title}'")
    print("=" * 70)
    print()

    # Test different word counts
    print("Different word counts:")
    for n in [2, 3, 4]:
        t = generator.generate(engn_text, max_words=n)
        print(f"  {n} words: '{t}'")

if __name__ == "__main__":
    test_engn_page()
