import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'

/* ------------------------------------------------------------------ *
 *  Every award has its own real, artist-modelled trophy now — not one  *
 *  generic cup relabelled six ways. Two earlier passes tried building  *
 *  a footballer figure by hand out of tapered cylinders/spheres —      *
 *  anatomically sound, but joints read as ball-bearings and there's    *
 *  no way to fake fabric folds or a face that way; genuine realism     *
 *  needs geometry an actual artist sculpted. No free, properly         *
 *  licensed footballer-statue asset turned up after a real search      *
 *  (Kenney's sports pack is 2D sprites only; Quaternius/Mixamo-style   *
 *  packs are generic game characters; Sketchfab downloads need a       *
 *  login this environment can't provide) — but plain CC0/CC-BY OBJECT  *
 *  models (no login, static direct URLs) turned out to be easy to      *
 *  source, and a themed object is exactly what most of these           *
 *  categories actually want (a merguez for "Pire joueur" reads a lot   *
 *  funnier than a generic cup ever could). All six ship in             *
 *  apps/web/public/models/ (no runtime fetch to a third party). */

/** One award category's trophy — everything CategoryTrophyScene needs to load, scale and
 * light the right model, and everything the plaque needs to engrave the right title. */
export interface TrophyConfig {
  modelUrl: string
  /** The model's largest dimension is rescaled to this world-space size — max, not always Y,
   * because these came from six different artists with six different modelling conventions
   * (a knife's longest axis is rarely "up"). */
  targetSize: number
  /** Euler radians applied before measuring/centring — for the handful of models that came
   * in lying on their side by the original artist's convention. */
  rotation?: readonly [number, number, number]
  color: string
  metalness: number
  roughness: number
  /** The drum band's colour — usually matches the trophy metal, but doesn't have to (the
   * sausage isn't metal at all, so its drum stays club-blue instead of trying to match). */
  accentColor: string
  plaqueLines: readonly [string, string]
}

/** Keyed by the fixed category `key` from fixed-categories.ts (API side) — "player_of_month"
 * reuses the same key the monthly award's own category rows carry. */
export const CATEGORY_TROPHIES: Record<string, TrophyConfig> = {
  player_of_season: {
    modelUrl: '/models/crown.glb',
    targetSize: 1.05,
    color: '#f4b400',
    metalness: 1,
    roughness: 0.14,
    accentColor: '#f4b400',
    plaqueLines: ['JOUEUR DE', 'LA SAISON'],
  },
  player_of_month: {
    modelUrl: '/models/trophy.glb',
    targetSize: 1.5,
    color: '#f4b400',
    metalness: 1,
    roughness: 0.17,
    accentColor: '#f4b400',
    plaqueLines: ['JOUEUR', 'DU MOIS'],
  },
  breakthrough: {
    modelUrl: '/models/star.glb',
    targetSize: 1.05,
    rotation: [Math.PI / 6, 0, 0],
    color: '#f4b400',
    metalness: 1,
    roughness: 0.14,
    accentColor: '#0089cf',
    plaqueLines: ['REVELA', 'TION'],
  },
  best_teammate: {
    modelUrl: '/models/heart.glb',
    targetSize: 1.0,
    color: '#e8a0ab',
    metalness: 0.85,
    roughness: 0.18,
    accentColor: '#f4b400',
    plaqueLines: ['MEILLEUR', 'COEQUIPIER'],
  },
  worst_player: {
    modelUrl: '/models/sausage.glb',
    targetSize: 1.1,
    color: '#9c4a2e',
    metalness: 0.1,
    roughness: 0.55,
    accentColor: '#0089cf',
    plaqueLines: ['PIRE', 'JOUEUR'],
  },
  butcher: {
    modelUrl: '/models/butcher_knife.glb',
    targetSize: 1.3,
    rotation: [0, Math.PI / 2, 0],
    color: '#c9cfd6',
    metalness: 1,
    roughness: 0.22,
    accentColor: '#0089cf',
    plaqueLines: ['BOUCHER DE', "L'EQUIPE"],
  },
  motm: {
    modelUrl: '/models/medal.glb',
    targetSize: 0.85,
    color: '#f4b400',
    metalness: 1,
    roughness: 0.16,
    accentColor: '#0089cf',
    plaqueLines: ['HOMME DU', 'MATCH'],
  },
  defense_boss: {
    modelUrl: '/models/shield.glb',
    targetSize: 1.1,
    color: '#c9cfd6',
    metalness: 1,
    roughness: 0.2,
    accentColor: '#f4b400',
    plaqueLines: ['PATRON DE', 'LA DEFENSE'],
  },
  attendance_month: {
    modelUrl: '/models/clock.glb',
    targetSize: 1.15,
    color: '#f4b400',
    metalness: 1,
    roughness: 0.16,
    accentColor: '#0089cf',
    plaqueLines: ['ASSIDU', 'DU MOIS'],
  },
  training_champion_month: {
    modelUrl: '/models/whistle.glb',
    targetSize: 1.2,
    rotation: [0, Math.PI / 2, 0],
    color: '#c9cfd6',
    metalness: 1,
    roughness: 0.2,
    accentColor: '#f4b400',
    plaqueLines: ['VAINQUEUR', "D'ENTRAINEMENT"],
  },
}

function LoadedTrophyModel({
  url,
  targetSize,
  rotation,
  material,
}: {
  url: string
  targetSize: number
  rotation?: readonly [number, number, number]
  material: THREE.Material
}) {
  const gltf = useLoader(GLTFLoader, url)

  const model = useMemo(() => {
    const scene = gltf.scene.clone(true)
    if (rotation) scene.rotation.set(...rotation)

    // The source files' own units are all over the place (sub-millimetre for some, metres
    // for others) and arbitrarily placed — rescale by whichever axis is actually largest
    // (not always "up") to a known size, and sit the result flush on y=0, centred on x/z,
    // regardless of whatever origin each original artist modelled around.
    const rawSize = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3())
    const scale = targetSize / (Math.max(rawSize.x, rawSize.y, rawSize.z) || 1)
    scene.scale.setScalar(scale)

    const box = new THREE.Box3().setFromObject(scene)
    const center = box.getCenter(new THREE.Vector3())
    scene.position.x -= center.x
    scene.position.z -= center.z
    scene.position.y -= box.min.y

    scene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh
        mesh.material = material
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
    return scene
  }, [gltf, material, rotation, targetSize])

  return <primitive object={model} />
}

/* ------------------------------------------------------------------ *
 *  The plaque — a real extruded "JOUEUR DU MOIS" (three.js's own      *
 *  bundled Helvetiker font, no network fetch) mounted on the drum,    *
 *  the single most recognisable "this is a real trophy" cue there is. *
 * ------------------------------------------------------------------ */

let fontPromise: Promise<Font> | null = null
/** Loaded once and shared — several trophies can be on screen together (the trophy case),
 * and there's no reason to re-fetch/re-parse the same 60KB font file for each of them. */
function loadTrophyFont(): Promise<Font> {
  fontPromise ??= new Promise((resolve, reject) => {
    new FontLoader().load('/fonts/helvetiker_bold.typeface.json', resolve, undefined, reject)
  })
  return fontPromise
}

const PLAQUE_LINE_MAX_WIDTH = 0.44

function PlaqueText({
  font,
  text,
  y,
  size = 0.075,
  color = '#1c1c1e',
}: {
  font: Font
  text: string
  y: number
  size?: number
  color?: string
}) {
  const { geometry, scale } = useMemo(() => {
    const g = new TextGeometry(text, { font, size, depth: 0.014, curveSegments: 3 })
    g.computeBoundingBox()
    const width = g.boundingBox ? g.boundingBox.max.x - g.boundingBox.min.x : PLAQUE_LINE_MAX_WIDTH
    g.center()
    // Some categories' plaque text ("BOUCHER DE" / "MEILLEUR COEQUIPIER") is a lot longer
    // than "JOUEUR" ever was — shrink to fit the plaque's own width instead of running off
    // the edge, rather than hardcoding one size that only happened to work for one category.
    return { geometry: g, scale: width > PLAQUE_LINE_MAX_WIDTH ? PLAQUE_LINE_MAX_WIDTH / width : 1 }
  }, [font, text, size])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} position={[0, y, 0.012]} scale={[scale, scale, 1]}>
      <meshStandardMaterial color={color} metalness={0.2} roughness={0.55} />
    </mesh>
  )
}

function Plaque({
  accentColor,
  lines,
  period,
}: {
  accentColor: string
  lines: readonly [string, string]
  /** The season ("2026-2027") or month ("SEPTEMBRE 2026") this particular win happened in —
   * engraved as a third, smaller line so two trophies of the same category are never
   * identical objects, the way a real one would carry a year stamped under the title. Not
   * every trophy gets one: only season and "joueur du mois" wins are tied to a period in a
   * way worth engraving — a match trophy's date/score lives in its click-through description
   * instead (see TrophyModal), not on the object itself. */
  period?: string
}) {
  const [font, setFont] = useState<Font | null>(null)
  useEffect(() => {
    let alive = true
    loadTrophyFont().then((f) => {
      if (alive) setFont(f)
    })
    return () => {
      alive = false
    }
  }, [])

  const plaqueHeight = period ? 0.3 : 0.24
  const [line1Y, line2Y, periodY] = period ? [0.09, -0.01, -0.115] : [0.05, -0.055, 0]

  return (
    <group position={[0, 0, 0.465]}>
      <mesh castShadow>
        <primitive object={new RoundedBoxGeometry(0.5, plaqueHeight, 0.02, 3, 0.03)} attach="geometry" />
        <meshStandardMaterial color="#d7dbe0" metalness={0.85} roughness={0.28} />
      </mesh>
      {font && (
        <>
          <PlaqueText font={font} text={lines[0]} y={line1Y} />
          <PlaqueText font={font} text={lines[1]} y={line2Y} />
          {period && <PlaqueText font={font} text={period} y={periodY} size={0.044} color={accentColor} />}
        </>
      )}
      {!font && (
        // While the font loads, a neutral accent-coloured strip so the plaque isn't just a
        // blank grey rectangle for that one frame.
        <mesh position={[0, 0, 0.011]}>
          <boxGeometry args={[0.4, 0.03, 0.008]} />
          <meshStandardMaterial color={accentColor} metalness={0.8} roughness={0.3} />
        </mesh>
      )}
    </group>
  )
}

/* ------------------------------------------------------------------ *
 *  The pedestal — a two-tier chrome podium under a banded drum, the   *
 *  same silhouette a real display trophy's base has (a shelf-mounted  *
 *  figure alone, with no base at all, reads as a toy).                *
 * ------------------------------------------------------------------ */

const TIER1_H = 0.22
const TIER2_H = 0.18
const DRUM_RING_H = 0.06
const DRUM_CORE_H = 0.34
const DRUM_H = DRUM_RING_H * 2 + DRUM_CORE_H
/** The Y a figure's feet should sit at — the top of the whole pedestal stack. */
export const PEDESTAL_HEIGHT = TIER1_H + TIER2_H + DRUM_H

function Pedestal({
  accentColor,
  plaqueLines,
  period,
}: {
  accentColor: string
  plaqueLines: readonly [string, string]
  period?: string
}) {
  const chrome = { color: '#c9cfd6', metalness: 0.95, roughness: 0.24 } as const
  const tier1Y = TIER1_H / 2
  const tier2Y = TIER1_H + TIER2_H / 2
  const drumY = TIER1_H + TIER2_H + DRUM_H / 2

  return (
    <group>
      <mesh position={[0, tier1Y, 0]} castShadow receiveShadow>
        <primitive object={new RoundedBoxGeometry(1.5, TIER1_H, 1.0, 3, 0.045)} attach="geometry" />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <mesh position={[0, tier2Y, 0]} castShadow receiveShadow>
        <primitive object={new RoundedBoxGeometry(1.08, TIER2_H, 0.72, 3, 0.035)} attach="geometry" />
        <meshStandardMaterial {...chrome} />
      </mesh>
      <group position={[0, drumY, 0]}>
        <mesh position={[0, DRUM_H / 2 - DRUM_RING_H / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.47, 0.47, DRUM_RING_H, 48]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        <mesh position={[0, -(DRUM_H / 2 - DRUM_RING_H / 2), 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.47, 0.47, DRUM_RING_H, 48]} />
          <meshStandardMaterial {...chrome} />
        </mesh>
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[0.47, 0.47, DRUM_CORE_H, 48]} />
          <meshStandardMaterial color={accentColor} metalness={0.9} roughness={0.28} />
        </mesh>
        <Plaque accentColor={accentColor} lines={plaqueLines} period={period} />
      </group>
    </group>
  )
}

/* ------------------------------------------------------------------ *
 *  Putting it together, plus the shared studio lighting.              *
 * ------------------------------------------------------------------ */

function SpinningTrophy({
  config,
  spinning,
  period,
}: {
  config: TrophyConfig
  spinning: boolean
  period?: string
}) {
  const groupRef = useRef<THREE.Group>(null)
  useFrame((_, delta) => {
    if (spinning && groupRef.current) groupRef.current.rotation.y += delta * 0.55
  })

  // Applied to every mesh in the loaded model (it ships with a plain white placeholder
  // material) — MeshPhysicalMaterial rather than Standard, since the extra clearcoat layer
  // is what actually sells "polished cast [metal]" at a close, zoomed-in view (see
  // TrophyModal): a crisp, slightly separate specular highlight sitting on top of the
  // object's own reflection, instead of one flatter combined one. Still applied even to the
  // non-metal sausage — a little clearcoat reads as "glossy" rather than "metallic" at low
  // enough metalness, which is exactly what a merguez needs.
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: config.color,
        metalness: config.metalness,
        roughness: config.roughness,
        envMapIntensity: 1.3,
        clearcoat: 0.6,
        clearcoatRoughness: 0.12,
      }),
    [config.color, config.metalness, config.roughness],
  )
  useEffect(() => () => material.dispose(), [material])

  return (
    <group ref={groupRef}>
      <Pedestal accentColor={config.accentColor} plaqueLines={config.plaqueLines} period={period} />
      <group position={[0, PEDESTAL_HEIGHT, 0]}>
        <LoadedTrophyModel
          url={config.modelUrl}
          targetSize={config.targetSize}
          rotation={config.rotation}
          material={material}
        />
      </group>
    </group>
  )
}

/** Fires `onSnapshot` once, a few real rendered frames after mount — placed as a Suspense
 * sibling to SpinningTrophy (see TrophyScene) so it doesn't even mount until the GLTF has
 * actually resolved, and the short frame count after that gives the renderer time to
 * actually paint the now-populated scene before the canvas gets read back. A blind
 * setTimeout from Canvas's onCreated was tried first and is NOT equivalent — onCreated
 * fires the instant the renderer exists, well before the model has loaded, so the timer
 * can (and, under any real contention from sibling snapshot canvases loading at the same
 * time, reliably did) elapse before a single frame with real content had painted, capturing
 * a blank image with no error to show for it. */
function SnapshotCapture({ onSnapshot }: { onSnapshot: (dataUrl: string) => void }) {
  const { gl } = useThree()
  const fired = useRef(false)
  const frames = useRef(0)
  useFrame(() => {
    if (fired.current) return
    frames.current += 1
    if (frames.current >= 3) {
      fired.current = true
      onSnapshot(gl.domElement.toDataURL('image/png'))
    }
  })
  return null
}

/** Sets scene.environment to a small procedurally-lit "room" (baked once via PMREM) so the
 * metal actually has something to reflect — a bare MeshStandardMaterial with metalness near
 * 1 and no environment map just renders flat black, no matter how many lights point at it.
 * Built entirely from three's own bundled RoomEnvironment (no network fetch, no HDRI file to
 * ship), so this works the same offline as it does in production. */
function StudioEnvironment() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.035).texture
    scene.environment = envTexture
    return () => {
      envTexture.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
  return null
}

/** A real, lit, rotating 3D trophy — whichever one `config` names, on its own chrome podium,
 * not a flat icon. Renders on a transparent canvas so it composites straight onto whatever
 * dark background it's placed over. Lazy-loaded (see MonthlyTrophyReveal / TrophyCasePage /
 * the season ceremony) since three.js is a meaningful chunk of weight nothing else in the
 * app needs. */
export function TrophyScene({
  config,
  spinning = true,
  period,
  className,
  onSnapshot,
}: {
  config: TrophyConfig
  spinning?: boolean
  /** Engraved on the plaque as a third, smaller line — see Plaque's own doc comment. */
  period?: string
  className?: string
  /** Switches this Canvas into one-shot "render a still image, then hand back a PNG data
   * URL" mode instead of a normal live scene — see TrophySnapshot.tsx for why: a shelf full
   * of several *different* trophy models, each its own live WebGL context, can silently
   * exceed the browser's concurrent-context budget and go blank with no console error. A
   * static image sidesteps that entirely for anywhere several trophies show at once (the
   * shelf); a genuinely live spinning canvas is still used everywhere only one trophy is ever
   * on screen at a time (the reveal ceremonies, the click-to-enlarge modal). */
  onSnapshot?: (dataUrl: string) => void
}): ReactNode {
  return (
    <Canvas
      className={className}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: !!onSnapshot }}
      camera={{ position: [0.15, 1.4, 4.3], fov: 28 }}
      dpr={onSnapshot ? 1 : [1, 2]}
    >
      <StudioEnvironment />
      <ambientLight intensity={0.32} />
      <directionalLight position={[3, 5.5, 4]} intensity={1.8} color="#fff6e0" />
      <directionalLight position={[-4, 2.5, -3]} intensity={0.7} color="#9fd4ff" />
      <directionalLight position={[0, 1.5, -4]} intensity={0.9} color="#ffe9b0" />
      <pointLight position={[0, 3, 2.2]} intensity={0.55} color="#ffe9b0" />
      {/* useLoader (GLTFLoader, inside LoadedTrophyModel) suspends the same way any other
          Suspense-aware hook does, but the Canvas's contents render in their own React root
          — a Suspense boundary living *outside* the Canvas (e.g. the one MonthlyTrophyReveal
          wraps the lazy-loaded scene component in) never sees that suspend at all, so the
          whole 3D tree just silently renders nothing. This one, inside the Canvas, is the one
          that actually catches it. */}
      <Suspense fallback={null}>
        <group position={[0, -1.35, 0]}>
          <SpinningTrophy config={config} spinning={spinning} period={period} />
        </group>
        {onSnapshot && <SnapshotCapture onSnapshot={onSnapshot} />}
      </Suspense>
    </Canvas>
  )
}

/** The trophy for any of the fixed award categories — season, monthly, or per-match — keyed
 * the same way the category/kind strings themselves are (fixed-categories.ts on the API side
 * for season/month; 'motm' | 'defense_boss' for per-match wins). Unknown keys fall back to
 * the classic cup rather than rendering nothing. */
export function CategoryTrophyScene({
  categoryKey,
  spinning = true,
  period,
  className,
  onSnapshot,
}: {
  categoryKey: string
  spinning?: boolean
  /** Engraved on the plaque as a third, smaller line — see Plaque's own doc comment. */
  period?: string
  className?: string
  /** See TrophyScene's own doc comment on this prop. */
  onSnapshot?: (dataUrl: string) => void
}) {
  const config = CATEGORY_TROPHIES[categoryKey] ?? CATEGORY_TROPHIES.player_of_month
  return (
    <TrophyScene
      config={config}
      spinning={spinning}
      period={period}
      className={className}
      onSnapshot={onSnapshot}
    />
  )
}

/** The snapshot queue's own renderer — one Canvas/WebGLRenderer that stays mounted for the
 * queue's entire lifetime, swapping which trophy sits inside it (via `itemKey` forcing a
 * fresh Suspense boundary, not a fresh Canvas) rather than TrophySnapshotHost mounting and
 * unmounting a separate `<CategoryTrophyScene>` per item. That per-item-Canvas approach was
 * tried first and reliably stalled a handful of items into any real queue: destroying and
 * recreating a WebGL context that often outpaces the browser's own context garbage
 * collection, so a later item's context creation can silently fail (no frames ever render,
 * no error either) once enough churn has happened. One long-lived context has nothing to
 * outpace. */
export function TrophySnapshotQueueCanvas({
  itemKey,
  categoryKey,
  period,
  onSnapshot,
}: {
  itemKey: string
  categoryKey: string
  period?: string
  onSnapshot: (dataUrl: string) => void
}) {
  const config = CATEGORY_TROPHIES[categoryKey] ?? CATEGORY_TROPHIES.player_of_month
  return (
    <Canvas
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
      camera={{ position: [0.15, 1.4, 4.3], fov: 28 }}
      dpr={1}
    >
      <StudioEnvironment />
      <ambientLight intensity={0.32} />
      <directionalLight position={[3, 5.5, 4]} intensity={1.8} color="#fff6e0" />
      <directionalLight position={[-4, 2.5, -3]} intensity={0.7} color="#9fd4ff" />
      <directionalLight position={[0, 1.5, -4]} intensity={0.9} color="#ffe9b0" />
      <pointLight position={[0, 3, 2.2]} intensity={0.55} color="#ffe9b0" />
      {/* Keyed by itemKey — swapping to a new trophy tears down and rebuilds just this
          Suspense subtree (a fresh useLoader suspend, a fresh SnapshotCapture frame count),
          leaving the Canvas/renderer/lights/environment above untouched. */}
      <Suspense key={itemKey} fallback={null}>
        <group position={[0, -1.35, 0]}>
          <SpinningTrophy config={config} spinning={false} period={period} />
        </group>
        <SnapshotCapture onSnapshot={onSnapshot} />
      </Suspense>
    </Canvas>
  )
}
