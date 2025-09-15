import React, { useState, useEffect } from 'react';
import './chunk-loader.scss';

interface ChunkLoaderProps {
  message: string;
  isSecondLoad?: boolean;
}

export default function ChunkLoader({ message, isSecondLoad = false }: ChunkLoaderProps) {
    const [progress, setProgress] = useState(0);
    const MINIMUM_LOADING_TIME = 2000; // 3 seconds minimum

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
        <div className="chunk-loader">
            <div className="stars">
                <div className="star"></div>
                <div className="star"></div>
                <div className="star"></div>
                <div className="star"></div>
                <div className="star"></div>
                <div className="star"></div>
                <div className="star"></div>
                <div className="star"></div>
                <div className="star"></div>
                <div className="star"></div>
            </div>
            <div className="container">
                <div className="card">
                    <div className="card-stars">
                        <div className="card-star"></div>
                        <div className="card-star"></div>
                        <div className="card-star"></div>
                        <div className="card-star"></div>
                        <div className="card-star"></div>
                    </div>
                    <div className="head">
                        <span className="fx">-X-</span>
                        <span className="starlite">DBTRADERS</span>
                    
                    </div>
                    <div className="loading-section">
                        <div className="loading-text">
                            <h3>CONNECTING TO THE MARKET</h3>
                            <div className="fxx">ESTABLISHING SECURE CONNECTIONS</div>
                        </div>
                    </div>
                    <div className="circle-container">
                        <div className="circle-indicator" data-percent="25" data-color="#ffd000ff">
                            BOTS
                            <div className="percent">{isSecondLoad ? '100%' : `${Math.floor(10 + (progress * 0.5))}%`}</div>
                            <div className="circle-ring">
                                <svg width="60" height="60">
                                    <circle className="bg" cx="30" cy="30" r="26"></circle>
                                    <circle className="fg clockwise" cx="30" cy="30" r="26" stroke="#ffd000ff" strokeWidth="6" strokeDasharray="0 163.36" strokeDashoffset="0"></circle>
                                    <circle className="fg counterclockwise" cx="30" cy="30" r="26" stroke="#ffd000ff" strokeWidth="6" strokeDasharray="0 163.36" strokeDashoffset="0"></circle>
                                </svg>
                            </div>
                        </div>
                        <div className="circle-indicator" data-percent="25" data-color="#00aaff">
                            ANALYSIS
                            <div className="percent">{isSecondLoad ? '100%' : `${Math.floor(10 + (progress * 0.5))}%`}</div>
                            <div className="circle-ring">
                                <svg width="60" height="60">
                                    <circle className="bg" cx="30" cy="30" r="26"></circle>
                                    <circle className="fg clockwise" cx="30" cy="30" r="26" stroke="#ffd000ff" strokeWidth="6" strokeDasharray="0 163.36" strokeDashoffset="0"></circle>
                                    <circle className="fg counterclockwise" cx="30" cy="30" r="26" stroke="#ffd000ff" strokeWidth="6" strokeDasharray="0 163.36" strokeDashoffset="0"></circle>
                                </svg>
                            </div>
                        </div>
                        <div className="circle-indicator" data-percent="25" data-color="#51ff00ff">
                            TOOLS
                            <div className="percent">{isSecondLoad ? '100%' : `${Math.floor(10 + (progress * 0.5))}%`}</div>
                            <div className="circle-ring">
                                <svg width="60" height="60">
                                    <circle className="bg" cx="30" cy="30" r="26"></circle>
                                    <circle className="fg clockwise" cx="30" cy="30" r="26" stroke="#ffd000ff" strokeWidth="6" strokeDasharray="0 163.36" strokeDashoffset="0"></circle>
                                    <circle className="fg counterclockwise" cx="30" cy="30" r="26" stroke="#ffd000ff" strokeWidth="6" strokeDasharray="0 163.36" strokeDashoffset="0"></circle>
                                </svg>
                            </div>
                        </div>
                        <div className="circle-indicator" data-percent="25" data-color="#00aaff">
                            SIGNALS
                            <div className="percent">{isSecondLoad ? '100%' : `${Math.floor(10 + (progress * 0.5))}%`}</div>
                            <div className="circle-ring">
                                <svg width="60" height="60">
                                    <circle className="bg" cx="30" cy="30" r="26"></circle>
                                    <circle className="fg clockwise" cx="30" cy="30" r="26" stroke="#ffd000ff" strokeWidth="6" strokeDasharray="0 163.36" strokeDashoffset="0"></circle>
                                    <circle className="fg counterclockwise" cx="30" cy="30" r="26" stroke="#ffd000ff" strokeWidth="6" strokeDasharray="0 163.36" strokeDashoffset="0"></circle>
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="progress-container">
                    <div className="progress-bar">
                        <div className="progress" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>
                <div className="chart">
                    <div className="building"></div>
                    <div className="building"></div>
                    <div className="building"></div>
                    <div className="building"></div>
                    <div className="building"></div>
                    <div className="building"></div>
                    <div className="building"></div>
                    <div className="building"></div>
                    <div className="building"></div>
                    <div className="building"></div>
                    <div className="building"></div>
                    <div className="building"></div>
                    <div className="building"></div>
                    <div className="building"></div>
                    <div className="building"></div>
                </div>
            </div>
        </div>
    );
  }
