import React, { useEffect, useRef, useState } from 'react';
import './Personalization.css';

interface PersonalizationProps { }

const PERSONALIZATION_DATA = [
    {
        label: 'TITLE',
        generic: 'Introduction to Computer Science Lecture',
        personalized: 'CS 200 Lecture',
        annotation: 'Learns your naming conventions',
    },
    {
        label: 'DURATION',
        generic: '60 min',
        personalized: '80 min',
        annotation: 'Knows your actual class lengths',
    },
    {
        label: 'CALENDAR',
        generic: 'Default',
        personalized: 'Classes',
        annotation: 'Assigns to the right calendar',
    },
    {
        label: 'LOCATION',
        generic: 'CIT Building Room 368',
        personalized: 'CIT 368',
        annotation: 'Matches how you write locations',
    },
    {
        label: 'REMINDER',
        generic: '30 min before',
        personalized: 'None',
        annotation: 'Knows you skip reminders for classes',
    },
];

const FEATURE_PILLS = [
    'Personalized',
    'Title Conventions',
    'Location Formatting',
    'Smart Durations',
    'Location formatting',
    'Color Coding',
];

export const Personalization: React.FC<PersonalizationProps> = () => {
    const [activeRow, setActiveRow] = useState(-1); // -1: not started, 0-4: animating rows, 5: done
    const sectionRef = useRef<HTMLDivElement>(null);
    const hasAnimated = useRef(false);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && !hasAnimated.current) {
                    hasAnimated.current = true;
                    startAnimation();
                }
            },
            { threshold: 0.4 } // Start when 40% visible
        );

        if (sectionRef.current) {
            observer.observe(sectionRef.current);
        }

        return () => {
            if (sectionRef.current) {
                observer.unobserve(sectionRef.current);
            }
        };
    }, []);

    const startAnimation = async () => {
        for (let i = 0; i < PERSONALIZATION_DATA.length; i++) {
            setActiveRow(i);
            await new Promise((resolve) => setTimeout(resolve, 1200));
        }
        setActiveRow(PERSONALIZATION_DATA.length); // Complete
    };

    return (
        <section className="personalization-section" ref={sectionRef}>
            <div className="personalization-container">
                <div className="personalization-left">
                    <h2 className="personalization-headline">
                        It already knows
                        <br />
                        how <span className="highlight-you">you</span> do things
                    </h2>

                    <div className="feature-pills">
                        {FEATURE_PILLS.map((pill, index) => (
                            <div
                                key={index}
                                className={`feature-pill${index === 0 ? ' active' : ''}`}
                            >
                                {pill}
                            </div>
                        ))}
                    </div>

                    <p className="personalization-subtext">
                        DropCal reads your existing calendar and learns your conventions. Every event feels like one you made yourself — because the system already knows how you make them.
                    </p>
                </div>

                <div className="personalization-right">
                    <div className="personalization-card">
                        <div className="card-header">
                            <div className="header-left">
                                <div className="dot"></div>
                                <span className="header-title">New Event Preview</span>
                            </div>
                            <div className={`header-status ${activeRow === PERSONALIZATION_DATA.length ? 'complete' : ''}`}>
                                {activeRow === PERSONALIZATION_DATA.length ? '✓ Personalized' : 'Personalizing...'}
                            </div>
                        </div>

                        <div className="card-body">
                            {PERSONALIZATION_DATA.map((item, index) => {
                                const isPast = activeRow > index;
                                const isCurrent = activeRow === index;

                                return (
                                    <div
                                        key={index}
                                        className={`card-row ${isCurrent ? 'active' : ''} ${isPast ? 'done' : ''}`}
                                    >
                                        <div className="row-label">{item.label}</div>
                                        <div className="row-value-container">
                                            <span className="value-generic">{item.generic}</span>
                                            <span className="value-personalized">{item.personalized}</span>
                                        </div>
                                        <div className="row-annotation">{item.annotation}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};
