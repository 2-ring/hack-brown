import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    FilePdf,
    Image as ImageIcon,
    Envelope,
    Microphone,
    ChatCircleText,
    Notepad,
    CheckCircle,
    ShootingStar,
    Link
} from '@phosphor-icons/react';
import { CTAButton } from './CTAButton';
import { AppIcon } from '../AppIcon';
import { FlowPath } from './FlowPath';
import type { Point } from './pathUtils';
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
    const [activeIndex, setActiveIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setActiveIndex((prev) => (prev + 1) % INPUTS.length);
        }, 2500); // 2.5s cycle
        return () => clearInterval(interval);
    }, []);

    // Flowing path icons (input types)
    const flowIcons = [FilePdf, ImageIcon, Envelope, Microphone, ChatCircleText, Notepad].map(
        (Icon, i) => (
            <div key={i} className="hero-flow-icon-card">
                <Icon weight="duotone" />
            </div>
        )
    );

    // Left path: off-screen left → under the icon (center)
    const leftPath: Point[] = [
        { x: -100, y: 200 },
        { x: 200, y: 480 },
        { x: 500, y: 250 },
        { x: 750, y: 450 },
        { x: 960, y: 540 },
    ];

    // Right path: under the icon (center) → off-screen right
    const rightPath: Point[] = [
        { x: 960, y: 540 },
        { x: 1170, y: 300 },
        { x: 1400, y: 480 },
        { x: 1700, y: 280 },
        { x: 2060, y: 400 },
    ];

    return (
        <section className="welcome-hero-section">
            <div className="hero-bg-orb" />

            <FlowPath
                icons={flowIcons}
                iconSize={52}
                gap={16}
                path={leftPath}
                duration={30}
                className="hero-flow-left"
            />
            <FlowPath
                icons={flowIcons}
                iconSize={52}
                gap={16}
                path={rightPath}
                duration={30}
                className="hero-flow-right"
            />

            <div className="hero-content">
                <h1 className="hero-headline">
                    <span>Drop anything straight</span>
                    <span className="gradient-text">into your calendar.</span>
                </h1>

                <p className="hero-subtext">
                    Photos, PDFs, emails, voice notes, text — DropCal turns any input into perfectly formatted calendar events. One click.
                </p>

                <div className="hero-animation">
                    {/* Left Column: Inputs */}
                    <div className="anim-column input-column">
                        {INPUTS.map((input, index) => {
                            const isActive = index === activeIndex;
                            const len = INPUTS.length;
                            let relativeIndex = (index - activeIndex + len) % len;
                            if (relativeIndex > len / 2) relativeIndex -= len;

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
                            <motion.path
                                d="M 50,100 C 120,100 120,100 180,100"
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
                            <AppIcon size={120} />
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

                <div className="hero-ctas">
                    <CTAButton
                        text="See the magic"
                        to="/"
                        backgroundColor="var(--primary)"
                        textColor="white"
                        iconLeft={<ShootingStar size={22} weight="duotone" />}
                        iconRight={<Link size={18} weight="bold" />}
                    />
                </div>
            </div>
        </section>
    );
};

export default Hero;
