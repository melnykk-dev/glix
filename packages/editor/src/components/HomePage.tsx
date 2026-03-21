import React from 'react';
import { useEditorStore } from '../store/useEditorStore';
import {
    Zap,
    Layers,
    MousePointer2,
    Code2,
    Cpu,
    Globe,
    ChevronRight,
    Sparkles,
    ShieldCheck
} from 'lucide-react';

export const HomePage: React.FC = () => {
    const { setHasEnteredEditor } = useEditorStore();

    return (
        <div className="home-page">
            <div className="home-bg-glow"></div>

            {/* Navigation */}
            <nav className="home-nav">
                <div className="home-logo">
                    <img src="/logo-mark-dark.svg" alt="Glix Logo" width="32" height="32" />
                    <span>Glix</span>
                </div>
                <div className="home-nav-links">
                    <button className="btn-start-mini" onClick={() => setHasEnteredEditor(true)}>
                        Start Editor <ChevronRight size={14} />
                    </button>
                </div>
            </nav>

            {/* Hero Section */}
            <div className="home-content-wrapper">
                <header className="home-hero">
                    <div className="badge-glow">
                        <Sparkles size={12} /> Version 0.1.0 Alpha
                    </div>
                    <h1>Build the next <span className="text-gradient">2D Masterpiece</span></h1>
                    <p className="hero-subtitle">
                        Glix is an ultra-fast, local-first game engine for the modern web.
                        Powerful ECS architecture meets an intuitive visual editor.
                    </p>
                    <div className="hero-actions">
                        <button className="btn-primary-hero" onClick={() => setHasEnteredEditor(true)}>
                            Launch Editor <ChevronRight size={18} />
                        </button>
                    </div>
                </header>

                {/* Main Image / Preview */}
                <div className="home-preview-container">
                    <div className="home-preview-window">
                        <img src="/social-preview.svg" alt="Editor Preview" className="home-preview-img" />
                        <div className="preview-overlay"></div>
                    </div>
                </div>

                {/* Features Grid */}
                <section className="home-features">
                    <h2 className="section-title">Everything you need to <span className="text-gradient">Ship Fast</span></h2>
                    <div className="features-grid">
                        <FeatureCard
                            icon={<Layers size={24} />}
                            title="Pure ECS Architecture"
                            description="High performance Entity-Component-System core built for scale. Manage thousands of entities with ease."
                        />
                        <FeatureCard
                            icon={<Code2 size={24} />}
                            title="Typed Scripting"
                            description="Seamless TypeScript integration with Monaco editor. Hot-reloading and IntelliSense out of the box."
                        />
                        <FeatureCard
                            icon={<MousePointer2 size={24} />}
                            title="Visual Tilemapping"
                            description="Paint levels directly in the browser. Auto-collisions and layer management included."
                        />
                        <FeatureCard
                            icon={<Cpu size={24} />}
                            title="WebGL Rendering"
                            description="Blazing fast 2D rendering with custom shaders and post-processing effects."
                        />
                        <FeatureCard
                            icon={<Globe size={24} />}
                            title="Local-First"
                            description="Your projects live in your browser. IndexedDB auto-saves mean you never lose progress."
                        />
                        <FeatureCard
                            icon={<ShieldCheck size={24} />}
                            title="Zero Setup"
                            description="No downloads. No installers. Just open the browser and start creating immediately."
                        />
                    </div>
                </section>

                {/* Tech Stack */}
                <section className="home-tech">
                    <p>Powered by modern technologies</p>
                    <div className="tech-icons">
                        <span title="React">React</span>
                        <span title="TypeScript">TypeScript</span>
                        <span title="Vite">Vite</span>
                        <span title="WebGL">WebGL</span>
                        <span title="Zustand">Zustand</span>
                    </div>
                </section>
            </div>

            {/* Footer */}
            <footer className="home-footer">
                <div className="footer-content">
                    <div className="footer-brand">
                        <img src="/favicon.svg" alt="Glix" width="20" height="20" />
                        <span>Glix Engine</span>
                    </div>
                    <div className="footer-copy">
                        &copy; 2026 Glix Team. Built with passion for game devs.
                    </div>
                </div>
            </footer>
        </div>
    );
};

interface FeatureProps {
    icon: React.ReactNode;
    title: string;
    description: string;
}

const FeatureCard: React.FC<FeatureProps> = ({ icon, title, description }) => (
    <div className="feature-card">
        <div className="feature-icon">{icon}</div>
        <h3>{title}</h3>
        <p>{description}</p>
    </div>
);
