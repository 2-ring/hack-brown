import type { FC } from 'react';
import { Check } from '@phosphor-icons/react';
import './FeatureDetails.css';

interface FeatureDetailsProps { }

export const FeatureDetails: FC<FeatureDetailsProps> = () => {
    return (
        <section className="feature-details-section">
            <div className="feature-details-flow">

                {/* Block 1 — Left */}
                <div className="feature-block feature-left">
                    <h3 className="feature-headline">Titles that sound like you</h3>
                    <p className="feature-subtext">
                        DropCal learns whether you say 'Math HW' or 'Math Homework,' whether you capitalize, whether you abbreviate. Every event title reads like one you wrote yourself.
                    </p>
                    <div className="feature-graphic titles-graphic">
                        <div className="title-example">
                            <div className="example-generic">Introduction to Computer Science — Tuesday Lecture Session</div>
                            <div className="example-personalized">
                                CS 200 Lecture <span className="checkmark"><Check weight="duotone" /></span>
                            </div>
                        </div>
                        <div className="title-example">
                            <div className="example-generic">Homework Assignment #4 — Abstract Algebra</div>
                            <div className="example-personalized">
                                MATH 540 HW 4 <span className="checkmark"><Check weight="duotone" /></span>
                            </div>
                        </div>
                        <div className="title-example">
                            <div className="example-generic">Team Sync — Weekly Standup</div>
                            <div className="example-personalized">
                                Team Sync <span className="checkmark"><Check weight="duotone" /></span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Block 2 — Right */}
                <div className="feature-block feature-right">
                    <h3 className="feature-headline">The right calendar, every time</h3>
                    <p className="feature-subtext">
                        Classes go to Classes. Work meetings go to Work. Deadlines go to Deadlines. DropCal learns which calendar you use for what — so you never have to pick from a dropdown again.
                    </p>
                    <div className="feature-graphic calendar-graphic">
                        <div className="calendar-item">
                            <div className="cal-dot red"></div>
                            <span className="cal-name">Classes</span>
                            <span className="cal-count">47 events</span>
                        </div>
                        <div className="calendar-item active">
                            <div className="cal-dot blue"></div>
                            <span className="cal-name">Work</span>
                            <span className="cal-count">23 events</span>
                            <div className="auto-assigned-badge">Auto</div>
                        </div>
                        <div className="calendar-item">
                            <div className="cal-dot green"></div>
                            <span className="cal-name">Personal</span>
                            <span className="cal-count">18 events</span>
                        </div>
                        <div className="calendar-item">
                            <div className="cal-dot orange"></div>
                            <span className="cal-name">Events</span>
                            <span className="cal-count">12 events</span>
                        </div>
                        <div className="calendar-item">
                            <div className="cal-dot purple"></div>
                            <span className="cal-name">Deadlines</span>
                            <span className="cal-count">5 events</span>
                        </div>
                    </div>
                </div>

                {/* Block 3 — Left */}
                <div className="feature-block feature-left">
                    <h3 className="feature-headline">Durations that match reality</h3>
                    <p className="feature-subtext">
                        Your 50-minute lectures, your 25-minute meetings, your all-day deadlines. DropCal learns your actual patterns — not default hour blocks.
                    </p>
                    <div className="feature-graphic duration-graphic">
                        <div className="duration-block-container">
                            <div className="duration-label">Generic</div>
                            <div className="duration-block generic">
                                <span>60 min</span>
                            </div>
                        </div>
                        <div className="duration-block-container">
                            <div className="duration-label">Yours</div>
                            <div className="duration-block personalized">
                                <span>80 min</span>
                                <div className="duration-annotation">
                                    DropCal learned your CS 200 lectures are 80 mins
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </section>
    );
};
