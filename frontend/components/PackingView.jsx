'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, RoundedBox } from '@react-three/drei';
import { packItems, volumeToContainer } from '@/utils/binPack';

const ITEM_COLORS = [
  '#00e5ff', '#ff9100', '#76ff03', '#e040fb',
  '#ffea00', '#ff5252', '#69f0ae', '#448aff',
];

function AnimatedItem({ item, index, color, delay }) {
  const meshRef = useRef();
  const [visible, setVisible] = useState(false);
  const startTime = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  useFrame((_, delta) => {
    if (!visible || !meshRef.current) return;
    if (!startTime.current) startTime.current = Date.now();

    const elapsed = (Date.now() - startTime.current) / 1000;
    const targetY = item.y + item.h / 2;
    const dropFrom = targetY + 1.5;

    if (elapsed < 0.6) {
      // Spring-like drop animation
      const t = elapsed / 0.6;
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const bounce = Math.sin(t * Math.PI) * 0.05 * (1 - t);
      meshRef.current.position.y = dropFrom + (targetY - dropFrom) * eased + bounce;
      meshRef.current.scale.setScalar(0.5 + 0.5 * eased);
    } else {
      meshRef.current.position.y = targetY;
      meshRef.current.scale.setScalar(1);
    }
  });

  if (!visible) return null;

  return (
    <group ref={meshRef} position={[item.x + item.w / 2, item.y + item.h / 2 + 1.5, item.z + item.d / 2]}>
      <RoundedBox args={[item.w * 0.95, item.h * 0.95, item.d * 0.95]} radius={0.01} smoothness={2}>
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.85}
          roughness={0.3}
          metalness={0.1}
        />
      </RoundedBox>
      {/* Edge wireframe */}
      <mesh>
        <boxGeometry args={[item.w * 0.95, item.h * 0.95, item.d * 0.95]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.4} />
      </mesh>
      {/* Label */}
      <Text
        position={[0, item.h / 2 + 0.06, 0]}
        fontSize={0.06}
        color="white"
        anchorX="center"
        anchorY="bottom"
        font="/fonts/mono.woff"
        outlineColor="black"
        outlineWidth={0.005}
      >
        {item.label}
      </Text>
    </group>
  );
}

function ContainerWireframe({ container }) {
  return (
    <group position={[container.w / 2, container.h / 2, container.d / 2]}>
      <mesh>
        <boxGeometry args={[container.w, container.h, container.d]} />
        <meshBasicMaterial color="#00e5ff" wireframe transparent opacity={0.2} />
      </mesh>
      {/* Floor */}
      <mesh position={[0, -container.h / 2 + 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[container.w, container.d]} />
        <meshStandardMaterial color="#0a1628" transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

function RotatingScene({ children }) {
  const groupRef = useRef();
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.15;
    }
  });
  return <group ref={groupRef}>{children}</group>;
}

export function PackingView({ scanResult, hostAvailableM3 = 3.2, onDone }) {
  const [utilization, setUtilization] = useState(0);

  const { container, placements } = useMemo(() => {
    const container = volumeToContainer(hostAvailableM3);
    const breakdown = scanResult?.breakdown || [];

    const items = breakdown.map((b, i) => ({
      id: `item_${i}`,
      w: Math.max(b.width_m || 0.3, 0.1),
      h: Math.max(b.height_m || 0.3, 0.1),
      d: Math.max(b.depth_m || 0.15, 0.05),
      label: b.class || `Item ${i + 1}`,
    }));

    // If we only have one detection, add subdivided items for visual interest
    if (items.length === 1 && scanResult?.items?.length > 1) {
      const totalVol = items[0].w * items[0].h * items[0].d;
      const perItemVol = totalVol / scanResult.items.length;
      const side = Math.cbrt(perItemVol);
      items.length = 0;
      scanResult.items.filter(it => it.storable !== false).forEach((it, i) => {
        items.push({
          id: `item_${i}`,
          w: side * (0.8 + Math.random() * 0.4),
          h: side * (0.7 + Math.random() * 0.6),
          d: side * (0.6 + Math.random() * 0.5),
          label: it.name,
        });
      });
    }

    // Fallback: generate demo items if no breakdown data
    if (items.length === 0) {
      items.push(
        { id: 'item_0', w: 0.4, h: 0.3, d: 0.25, label: 'suitcase' },
        { id: 'item_1', w: 0.3, h: 0.25, d: 0.2, label: 'backpack' },
        { id: 'item_2', w: 0.25, h: 0.2, d: 0.2, label: 'box' },
      );
    }

    const placements = packItems(items, container);
    return { container, placements };
  }, [scanResult, hostAvailableM3]);

  useEffect(() => {
    const totalItemVol = placements
      .filter(p => p.fits)
      .reduce((sum, p) => sum + p.w * p.h * p.d, 0);
    const containerVol = container.w * container.h * container.d;
    const pct = Math.min(Math.round((totalItemVol / containerVol) * 100), 100);

    // Animate utilization counter
    let current = 0;
    const interval = setInterval(() => {
      current += 2;
      if (current >= pct) { current = pct; clearInterval(interval); }
      setUtilization(current);
    }, 30);
    return () => clearInterval(interval);
  }, [placements, container]);

  // Auto-advance after animation plays
  useEffect(() => {
    const timer = setTimeout(() => onDone?.(), 5000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 bg-[#060d18] flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-cyan-900/30">
        <div>
          <p className="text-cyan-400 font-mono text-xs tracking-wider">3D PACKING SIMULATION</p>
          <p className="text-white/50 text-[10px] font-mono mt-0.5">
            {container.w.toFixed(1)}m × {container.h.toFixed(1)}m × {container.d.toFixed(1)}m storage unit
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white">{utilization}%</p>
          <p className="text-cyan-500/60 text-[10px] font-mono">UTILIZATION</p>
        </div>
      </div>

      {/* 3D Scene */}
      <div className="flex-1">
        <Canvas
          camera={{ position: [2, 1.5, 2], fov: 50 }}
          gl={{ antialias: true, alpha: true }}
        >
          <color attach="background" args={['#060d18']} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[3, 5, 3]} intensity={0.8} color="#ffffff" />
          <pointLight position={[-2, 2, -2]} intensity={0.3} color="#00e5ff" />

          <RotatingScene>
            <ContainerWireframe container={container} />
            {placements.map((item, i) => (
              <AnimatedItem
                key={item.id}
                item={item}
                index={i}
                color={ITEM_COLORS[i % ITEM_COLORS.length]}
                delay={800 + i * 500}
              />
            ))}
          </RotatingScene>

          <OrbitControls
            enablePan={false}
            enableZoom={false}
            autoRotate={false}
            maxPolarAngle={Math.PI / 2}
          />
          {/* Grid floor */}
          <gridHelper args={[4, 20, '#0a2a3a', '#061520']} position={[container.w / 2, -0.01, container.d / 2]} />
        </Canvas>
      </div>

      {/* Bottom CTA */}
      <div className="px-4 py-4 border-t border-cyan-900/30 flex items-center justify-between">
        <p className="text-[10px] font-mono text-cyan-500/50">
          {placements.filter(p => p.fits).length}/{placements.length} ITEMS PACKED
        </p>
        <button
          onClick={() => onDone?.()}
          className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-sm px-5 py-2 rounded-lg transition-colors"
        >
          Find a host →
        </button>
      </div>
    </div>
  );
}
