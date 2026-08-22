import React, { useEffect, useRef, useState, Component } from 'react';
import * as THREE from 'three';
import { RevenueWidget, RoomWidget, StaffWidget, BookingWidget } from './Widgets';
import { HotelScene as SVGHotelFallback } from '../HotelScene';

interface ThreeHotelSceneProps {
  videoUrl?: string;
}

class ThreeErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.warn("Three.js render caught error, gracefully falling back to SVG:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="relative max-w-xl mx-auto my-6 select-none">
          <SVGHotelFallback />
          <RevenueWidget />
          <RoomWidget />
          <StaffWidget />
          <BookingWidget />
        </div>
      );
    }
    return this.props.children;
  }
}

const ThreeHotelSceneInner: React.FC<ThreeHotelSceneProps> = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hasWebGL, setHasWebGL] = useState(true);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    // Check reduced motion preference
    try {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mediaQuery.matches) {
        setIsReducedMotion(true);
      }
    } catch {
      // Ignore
    }

    // Check WebGL availability safely
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) setHasWebGL(false);
    } catch {
      setHasWebGL(false);
    }
  }, []);

  useEffect(() => {
    if (!hasWebGL || isReducedMotion || !mountRef.current) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let animationFrameId: number;

    try {
      const container = mountRef.current;
      const width = container.clientWidth || 500;
      const height = container.clientHeight || 450;

      // 1. Scene & Camera Setup
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x06152f, 0.02);

      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(18, 16, 26);
      camera.lookAt(0, 4, 0);

      // 2. WebGL Renderer Setup
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      // 3. Lighting
      const ambientLight = new THREE.AmbientLight(0x1e3a8a, 1.8);
      scene.add(ambientLight);

      const dirLight = new THREE.DirectionalLight(0x38bdf8, 2.5);
      dirLight.position.set(20, 30, 15);
      dirLight.castShadow = true;
      scene.add(dirLight);

      const cyanPoint = new THREE.PointLight(0x22d3ee, 3, 25);
      cyanPoint.position.set(0, 12, 0);
      scene.add(cyanPoint);

      const bluePoint = new THREE.PointLight(0x3b82f6, 2, 20);
      bluePoint.position.set(-6, 2, 8);
      scene.add(bluePoint);

      // 4. Stylized 3D Hotel Architecture
      const hotelGroup = new THREE.Group();

      // Podium Base
      const podiumGeo = new THREE.BoxGeometry(14, 1.2, 10);
      const podiumMat = new THREE.MeshPhongMaterial({
        color: 0x0f172a,
        specular: 0x38bdf8,
        shininess: 40,
      });
      const podium = new THREE.Mesh(podiumGeo, podiumMat);
      podium.position.y = 0.6;
      podium.receiveShadow = true;
      hotelGroup.add(podium);

      // Main Building Tower
      const towerGeo = new THREE.BoxGeometry(8, 14, 6);
      const towerMat = new THREE.MeshPhongMaterial({
        color: 0x1e293b,
        transparent: true,
        opacity: 0.9,
        shininess: 60,
      });
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.y = 8.2;
      tower.castShadow = true;
      tower.receiveShadow = true;
      hotelGroup.add(tower);

      // Illuminated Window Grid
      const windowGeo = new THREE.BoxGeometry(1.2, 0.9, 0.1);
      const litMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const dimMat = new THREE.MeshBasicMaterial({ color: 0x0f2744 });

      const windowsGroup = new THREE.Group();
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 4; c++) {
          const isLit = (r + c) % 2 === 0;
          const win = new THREE.Mesh(windowGeo, isLit ? litMat : dimMat);
          win.position.set(-2.7 + c * 1.8, 3.5 + r * 2.2, 3.06);
          windowsGroup.add(win);
        }
      }
      hotelGroup.add(windowsGroup);

      // Glowing Rooftop Crown
      const crownGeo = new THREE.BoxGeometry(8.4, 0.6, 6.4);
      const crownMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
      const crown = new THREE.Mesh(crownGeo, crownMat);
      crown.position.y = 15.4;
      hotelGroup.add(crown);

      // Orbiting Operational Data Ring Particles
      const particlesGeo = new THREE.BufferGeometry();
      const particleCount = 120;
      const positions = new Float32Array(particleCount * 3);

      for (let i = 0; i < particleCount; i++) {
        const angle = (i / particleCount) * Math.PI * 2;
        const radius = 9 + Math.random() * 4;
        positions[i * 3] = Math.cos(angle) * radius;
        positions[i * 3 + 1] = Math.random() * 12;
        positions[i * 3 + 2] = Math.sin(angle) * radius;
      }

      particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const particlesMat = new THREE.PointsMaterial({
        color: 0x38bdf8,
        size: 0.35,
        transparent: true,
        opacity: 0.8,
      });
      const particleSystem = new THREE.Points(particlesGeo, particlesMat);
      hotelGroup.add(particleSystem);

      scene.add(hotelGroup);

      // 5. Mouse Parallax & Animation Loop
      let mouseX = 0;
      let mouseY = 0;

      const handleMouseMove = (e: MouseEvent) => {
        mouseX = (e.clientX / window.innerWidth - 0.5) * 0.4;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 0.4;
      };
      window.addEventListener('mousemove', handleMouseMove);

      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);

        // Continuous gentle rotation
        hotelGroup.rotation.y += 0.003;
        particleSystem.rotation.y -= 0.005;

        // Parallax smooth interpolation
        camera.position.x += (18 + mouseX * 8 - camera.position.x) * 0.05;
        camera.position.y += (16 - mouseY * 8 - camera.position.y) * 0.05;
        camera.lookAt(0, 5, 0);

        if (renderer) {
          renderer.render(scene, camera);
        }
      };
      animate();

      // 6. Responsive Resize Handling
      const handleResize = () => {
        if (!mountRef.current || !renderer) return;
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('resize', handleResize);
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (mountRef.current && renderer && renderer.domElement) {
          mountRef.current.removeChild(renderer.domElement);
        }
        if (renderer) renderer.dispose();
      };
    } catch (err) {
      console.warn("Three.js setup encountered error, falling back to SVG:", err);
      setHasWebGL(false);
    }
  }, [hasWebGL, isReducedMotion]);

  if (!hasWebGL || isReducedMotion) {
    return (
      <div className="relative max-w-xl mx-auto my-6 select-none">
        <SVGHotelFallback />
        <RevenueWidget />
        <RoomWidget />
        <StaffWidget />
        <BookingWidget />
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-xl mx-auto lg:mx-0 my-4 select-none">
      {/* Ambient Glow behind 3D Scene */}
      <div className="absolute -inset-2 bg-gradient-to-r from-cyan-500/20 via-blue-600/20 to-indigo-600/20 rounded-3xl blur-2xl opacity-70 pointer-events-none" />

      {/* 3D Canvas Mount Point */}
      <div
        ref={mountRef}
        className="w-full h-[320px] sm:h-[380px] lg:h-[440px] rounded-3xl overflow-hidden border border-white/15 bg-slate-950/60 backdrop-blur-md shadow-2xl relative"
      />

      {/* Floating Live Operational Widgets */}
      <RevenueWidget />
      <RoomWidget />
      <StaffWidget />
      <BookingWidget />
    </div>
  );
};

export const ThreeHotelScene: React.FC<ThreeHotelSceneProps> = (props) => {
  return (
    <ThreeErrorBoundary>
      <ThreeHotelSceneInner {...props} />
    </ThreeErrorBoundary>
  );
};


