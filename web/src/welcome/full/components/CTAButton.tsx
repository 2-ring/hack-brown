import React from 'react';
import { useNavigate } from 'react-router-dom';
import './CTAButton.css';

interface CTAButtonProps {
    text: string;
    iconLeft?: React.ReactNode;
    iconRight?: React.ReactNode;
    textColor: string;
    backgroundColor: string;
    to: string;
    className?: string;
}

export const CTAButton: React.FC<CTAButtonProps> = ({
    text,
    iconLeft,
    iconRight,
    textColor,
    backgroundColor,
    to,
    className = ''
}) => {
    const navigate = useNavigate();

    return (
        <button
            className={`cta-button ${className}`}
            onClick={() => navigate(to)}
            style={{
                color: textColor,
                backgroundColor: backgroundColor,
            }}
        >
            {iconLeft && <span className="cta-icon">{iconLeft}</span>}
            <span>{text}</span>
            {iconRight && <span className="cta-icon">{iconRight}</span>}
        </button>
    );
};
