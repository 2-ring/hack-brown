"""
Test title generation on Canvas Contact Info page
"""

from extraction.title_generator import TitleGenerator

contact_text = """
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
Spring 2026 MATH 0180PagesContact Info & Office Hours

2026 Spring
Home
Pages
Gradescope
Media Library
Zoom
Contact Info & Office Hours
Your Instructors and Teaching Assistants are available to help you through e-mail and in regularly scheduled office hours. If you have questions about course policies or logistics, or issues your instructor cannot address, contact the Course Head.

When seeking content help, always prioritize contacting the instructor and TA assigned to your registered sections. If you need to meet with someone different due to scheduling conflicts, please write to them and ask permission first, rather than showing up to their office hours unannounced. Please understand that we offer multiple sections in order to divide workload (and honor agreements with the Graduate School), and no instructor or TA is obligated to provide instructional support for every student in the course.

Course Head

Name	E-Mail	Sections	Office Hours	Location
Dan Katz	daniel_katz@brown.edu	S01	Mon 2pm-4pm, Fri 1pm-2pm	Kassar 114

Instructors

Name	E-Mail	Sections	Office Hours	Location
Daksh Aggarwal	daksh_aggarwal@brown.edu	S03	Mon 3:30-4:30pm, Fri 2-3pm	Kassar Common Room
Dan Katz	daniel_katz@brown.edu	S01	Mon 2pm-4pm, Fri 1pm-2pm	Kassar 114
Kaiwen Lu	kaiwen_lu@brown.edu	S02	Mon 2-3pm, Fri 10:30-11:30am	Kassar Common Room

Teaching Assistants

Name	E-Mail	Sections	Office Hours	Location
Alberto Landi	alberto_landi@brown.edu	C03, C10	Mon 2-3pm, Fri 2-3pm	Kassar Common Room
Xuyan Liu	xuyan_liu@brown.edu	C01, C06	Tues,Thur 10-11am	Kassar Common Room
Ivy Stoner	ivy_stoner@brown.edu	C02, C09
1/22: 2:30-3:30pm

Starting 1/27: Tues 2:30-4:30pm

Kassar Common Room
Raluca Vlad	raluca_vlad@brown.edu	C04, C05	Mon 9-10am, Fri 2-3pm	Kassar Common Room
"""

def test_contact_page():
    print("=" * 70)
    print("TESTING: Canvas Contact Info & Office Hours")
    print("=" * 70)
    print()

    generator = TitleGenerator()

    print("Generating title...")
    title = generator.generate(contact_text, max_words=3)

    print()
    print("=" * 70)
    print(f"GENERATED TITLE: '{title}'")
    print("=" * 70)
    print()

    # Test different word counts
    print("Different word counts:")
    for n in [2, 3, 4]:
        t = generator.generate(contact_text, max_words=n)
        print(f"  {n} words: '{t}'")

if __name__ == "__main__":
    test_contact_page()
