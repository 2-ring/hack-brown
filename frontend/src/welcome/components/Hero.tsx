import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    FilePdf,
    Image as ImageIcon,
    Envelope,
    Microphone,
    ChatCircleText,
    Notepad,
    CalendarBlank,
    CheckCircle,
    ShootingStar,
    Link
} from '@phosphor-icons/react';
import './Hero.css';

// Input Data
const INPUTS = [
    { id: 1, type: 'PDF', label: 'Course Syllabus', icon: <FilePdf weight="duotone" /> },
    { id: 2, type: 'Photo', label: 'Event Flyer', icon: <ImageIcon weight="duotone" /> },
    { id: 3, type: 'Email', label: 'Email Confirmation', icon: <Envelope weight="duotone" /> },
    { id: 4, type: 'Voice', label: 'Voice Note', icon: <Microphone weight="duotone" /> },
    { id: 5, type: 'SMS', label: 'Text Message', icon: <ChatCircleText weight="duotone" /> },
    { id: 6, type: 'Doc', label: 'Meeting Notes', icon: <Notepad weight="duotone" /> },
];

// Output Data
const OUTPUTS = [
    { id: 1, title: 'CS 200 Lecture', details: 'Mon 10:30 AM · Classes', color: 'var(--interactive)' }, // Purple -> Interactive
    { id: 2, title: 'Midterm Exam', details: 'Mar 14, 2:00 PM · Exams', color: 'var(--error)' }, // Red -> Error
    { id: 3, title: 'Battle of the Bands', details: 'Fri 8:30 PM · Events', color: 'var(--warning)' }, // Orange -> Warning
    { id: 4, title: 'Office Hours', details: 'Wed 3:00 PM · Classes', color: 'var(--interactive)' }, // Purple -> Interactive
    { id: 5, title: 'Team Standup', details: 'Thu 9:00 AM · Work', color: 'var(--primary)' }, // Blue -> Primary
    { id: 6, title: 'Dentist', details: 'Mar 20, 11:00 AM · Personal', color: 'var(--success)' }, // Green -> Success
];

const Hero = () => {
    const navigate = useNavigate();
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveIndex((prev) => (prev + 1) % INPUTS.length);
        }, 2500); // 2.5s cycle
        return () => clearInterval(interval);
    }, []);

    return (
        <section className="welcome-hero-section">
            <div className="hero-bg-orb" />

            <div className="hero-content">
                <h1 className="hero-headline">
                    <span>Drop anything straight</span>
                    <span className="gradient-text">into your calendar.</span>
                </h1>

                <p className="hero-subtext">
                    Photos, PDFs, emails, voice notes, text — DropCal turns any input into perfectly formatted calendar events. One click.
                </p>

                <div className="hero-ctas">
                    <button onClick={() => navigate('/')} className="hero-cta-button">
                        <ShootingStar size={22} weight="duotone" />
                        See the magic
                        <Link size={18} weight="bold" />
                    </button>
                </div>

                <div className="hero-animation">
                    {/* Left Column: Inputs */}
                    <div className="anim-column input-column">
                        {INPUTS.map((input, index) => {
                            // Calculate relative position based on activeIndex
                            // We want active item in center, but let's just do a simple stack visual 
                            // where the active one pops out.
                            // Actually, the PRD says: "stack of input cards... at any given moment one is active"
                            // Let's position them absolute, but offset by index to make a list.
                            // Simpler approach: Map them all, layout via flex column, but manage opacity/scale.

                            // Refined approach: Render a "window" of items or just all of them with styles applied
                            // relative to the active index.

                            const isActive = index === activeIndex;
                            // Wrap distance for cyclic effect logic if we wanted a true carousel visual, 
                            // but purely linear list with highlight is easier to parse.

                            // Let's do a visual list, but "active" one is highlighted.
                            // Just rendering all of them in a column might be too tall.
                            // Let's use Framer Motion to animate their vertical positions so the active one is always vertically centered?
                            // The PRD says "vertical stack... active card is active... others dimmed".
                            // Let's render them relative to the active one.

                            // Let's try rendering relative positions: 
                            // 0 is active.
                            // -1 is previous
                            // 1 is next
                            // We can use modulo logic to find relative index.

                            const len = INPUTS.length;
                            // Proper modulo that handles negative numbers for cyclic 'previous' items
                            let relativeIndex = (index - activeIndex + len) % len;
                            if (relativeIndex > len / 2) relativeIndex -= len;

                            // Only Show ones within range -2 to +2?
                            if (Math.abs(relativeIndex) > 2) return null;

                            return (
                                <motion.div
                                    key={input.id}
                                    className={`input-card ${isActive ? 'active' : ''}`}
                                    initial={false}
                                    animate={{
                                        y: relativeIndex * 70, // 60px height + 10px gap
                                        scale: isActive ? 1.05 : 0.95,
                                        opacity: isActive ? 1 : 0.4,
                                        x: isActive ? 20 : 0, // Nudge right
                                        zIndex: isActive ? 10 : 0,
                                    }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    style={{
                                        position: 'absolute',
                                        top: '50%',
                                        marginTop: '-28px', // Half card height
                                        left: 0,
                                        right: 0
                                    }}
                                >
                                    <div className="input-card-icon" style={{ color: isActive ? 'var(--primary, #3b82f6)' : 'inherit' }}>
                                        {input.icon}
                                    </div>
                                    <div className="input-card-content">
                                        <span className="input-card-title">{input.label}</span>
                                        <span className="input-card-type">{input.type}</span>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Center Column: Icon & Paths */}
                    <div className="anim-center">
                        {/* SVG Connecting Lines - Absolute behind icon */}
                        <svg
                            width="100%"
                            height="100%"
                            style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}
                            viewBox="0 0 400 200"
                            preserveAspectRatio="none"
                        >


                            {/* Path from Input (Left) to Center */}
                            {/* Assuming roughly center-left to center */}
                            <motion.path
                                d="M 50,100 C 120,100 120,100 180,100"
                                // Bezier curve: start (50,100), control1, control2, end (180,100) -> Center x is ~200
                                fill="none"
                                stroke="var(--primary)"
                                strokeWidth="2"
                                strokeDasharray="4 4"
                                initial={{ strokeDashoffset: 0 }}
                                animate={{ strokeDashoffset: -200 }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                style={{ opacity: 0.5 }}
                            />

                            {/* Path from Center to Output (Right) */}
                            <motion.path
                                d="M 220,100 C 280,100 280,100 350,100"
                                fill="none"
                                stroke="var(--primary)"
                                strokeWidth="2"
                                strokeDasharray="4 4"
                                initial={{ strokeDashoffset: 0 }}
                                animate={{ strokeDashoffset: -200 }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                style={{ opacity: 0.5 }}
                            />
                        </svg>

                        <motion.div
                            className="dropcal-icon-wrapper"
                            animate={{ scale: [1, 1.05, 1] }}
                            transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                        >
                            <div className="dropcal-icon">
                                <CalendarBlank weight="duotone" />
                            </div>

                        </motion.div>
                    </div>

                    {/* Right Column: Outputs */}
                    <div className="anim-column output-column">
                        {OUTPUTS.map((output, index) => {
                            const isActive = index === activeIndex;
                            const len = OUTPUTS.length;
                            let relativeIndex = (index - activeIndex + len) % len;
                            if (relativeIndex > len / 2) relativeIndex -= len;

                            if (Math.abs(relativeIndex) > 2) return null;

                            return (
                                <motion.div
                                    key={output.id}
                                    className={`output-card ${isActive ? 'active' : ''}`}
                                    initial={false}
                                    animate={{
                                        y: relativeIndex * 70,
                                        scale: isActive ? 1.05 : 0.95,
                                        opacity: isActive ? 1 : 0.4,
                                        x: isActive ? -20 : 0, // Nudge left
                                        zIndex: isActive ? 10 : 0,
                                    }}
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    style={{
                                        position: 'absolute',
                                        top: '50%',
                                        marginTop: '-28px',
                                        left: 0,
                                        right: 0
                                    }}
                                >
                                    <div className="output-card-bar" style={{ backgroundColor: output.color }} />
                                    <div className="output-card-content">
                                        <span className="output-card-title">{output.title}</span>
                                        <span className="output-card-details">{output.details}</span>
                                    </div>
                                    <div className="output-card-check">
                                        <CheckCircle weight="duotone" />
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                <div className="hero-labels">
                    <span className="hero-label-text">Any Input</span>
                    <span className="hero-label-text">Your Calendar</span>
                </div>
            </div>
        </section>
    );
};

export default Hero;
