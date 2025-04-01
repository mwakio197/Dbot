import React, { useState, useEffect } from 'react';
import './futuristic-loader.scss';

type FuturisticLoaderProps = {
    message?: string;
};

const FuturisticLoader: React.FC<FuturisticLoaderProps> = ({ message }) => {
    const [progress, setProgress] = useState(0);
    const MINIMUM_LOADING_TIME = 3000; // 3 seconds minimum

    useEffect(() => {
        const startTime = Date.now();
        
        const timer = setInterval(() => {
            const elapsedTime = Date.now() - startTime;
            const progressValue = Math.min((elapsedTime / MINIMUM_LOADING_TIME) * 100, 100);
            setProgress(Math.floor(progressValue));
            
            if (progressValue >= 100) {
                clearInterval(timer);
            }
        }, 30);

        return () => clearInterval(timer);
    }, []);

    return (
        <div className='futuristic-loader'>
            <div className='loader-content'>
                <h1 className='logo'>BINARY<span>FX</span></h1>
                <div className='progress-bar'>
                    <div className='progress' style={{ width: `${progress}%` }}></div>
                    <div className='percentage'>{progress}%</div>
                </div>
                {message && <div className='loader-message'>{message}</div>}
                <div className='welcome-message'>Welcome to the Future of Trading</div>
            </div>
            <div className='background-effects'>
                {[...Array(20)].map((_, i) => (
                    <div key={i} className='particle'></div>
                ))}
            </div>
        </div>
    );
};

export default FuturisticLoader;
