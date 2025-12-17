import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Scene setup
const canvas = document.getElementById('globe-canvas');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

// Controls
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.rotateSpeed = 0.5;
controls.zoomSpeed = 0.8;
controls.minDistance = 1.8;
controls.maxDistance = 10;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.3;

// Texture Loader
const textureLoader = new THREE.TextureLoader();
const loadingManager = new THREE.LoadingManager();

loadingManager.onLoad = () => {
  document.getElementById('loading').classList.add('hidden');
};

// Earth textures - using NASA Blue Marble textures
const earthTexture = textureLoader.load(
  'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg'
);
const bumpTexture = textureLoader.load(
  'https://unpkg.com/three-globe@2.31.1/example/img/earth-topology.png'
);
const specularTexture = textureLoader.load(
  'https://unpkg.com/three-globe@2.31.1/example/img/earth-water.png'
);
const cloudsTexture = textureLoader.load(
  'https://unpkg.com/three-globe@2.31.1/example/img/earth-clouds.png'
);

// Earth Geometry
const earthGeometry = new THREE.SphereGeometry(1.5, 64, 64);

// Earth Material
const earthMaterial = new THREE.MeshPhongMaterial({
  map: earthTexture,
  bumpMap: bumpTexture,
  bumpScale: 0.02,
  specularMap: specularTexture,
  specular: new THREE.Color(0x333333),
  shininess: 15,
});

const earth = new THREE.Mesh(earthGeometry, earthMaterial);
scene.add(earth);

// Clouds layer
const cloudsGeometry = new THREE.SphereGeometry(1.52, 64, 64);
const cloudsMaterial = new THREE.MeshPhongMaterial({
  map: cloudsTexture,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
});
const clouds = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
scene.add(clouds);

// Atmosphere glow
const atmosphereGeometry = new THREE.SphereGeometry(1.6, 64, 64);
const atmosphereMaterial = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    void main() {
      float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
      gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
    }
  `,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
  transparent: true,
});
const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
scene.add(atmosphere);

// Starfield
function createStarfield() {
  const starsGeometry = new THREE.BufferGeometry();
  const starPositions = [];
  const starColors = [];
  
  for (let i = 0; i < 3000; i++) {
    const radius = 50 + Math.random() * 100;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    
    starPositions.push(x, y, z);
    
    // Varied star colors
    const colorChoice = Math.random();
    if (colorChoice > 0.95) {
      starColors.push(1, 0.8, 0.6); // Orange stars
    } else if (colorChoice > 0.9) {
      starColors.push(0.8, 0.9, 1); // Blue-white stars
    } else {
      starColors.push(1, 1, 1); // White stars
    }
  }
  
  starsGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(starPositions, 3)
  );
  starsGeometry.setAttribute(
    'color',
    new THREE.Float32BufferAttribute(starColors, 3)
  );
  
  const starsMaterial = new THREE.PointsMaterial({
    size: 0.15,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
    sizeAttenuation: true,
  });
  
  return new THREE.Points(starsGeometry, starsMaterial);
}

const stars = createStarfield();
scene.add(stars);

// Lighting
const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 2);
sunLight.position.set(5, 3, 5);
scene.add(sunLight);

// Subtle rim light
const rimLight = new THREE.DirectionalLight(0x88ccff, 0.3);
rimLight.position.set(-5, 0, -5);
scene.add(rimLight);

// UI Updates
const latValue = document.getElementById('lat-value');
const lonValue = document.getElementById('lon-value');
const altValue = document.getElementById('alt-value');

function updateCoordinates() {
  // Calculate viewing angle as coordinates
  const cameraPos = camera.position.clone().normalize();
  const lat = Math.asin(cameraPos.y) * (180 / Math.PI);
  const lon = Math.atan2(cameraPos.x, cameraPos.z) * (180 / Math.PI);
  const distance = camera.position.length();
  
  latValue.textContent = `${lat.toFixed(2)}°`;
  lonValue.textContent = `${lon.toFixed(2)}°`;
  altValue.textContent = `${(distance / 2).toFixed(1)}x`;
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  
  // Rotate clouds slightly faster than auto-rotate for effect
  clouds.rotation.y += 0.0003;
  
  // Subtle star twinkle
  stars.rotation.y += 0.00005;
  
  controls.update();
  updateCoordinates();
  renderer.render(scene, camera);
}

// Handle resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Stop auto-rotate on interaction
canvas.addEventListener('pointerdown', () => {
  controls.autoRotate = false;
});

// Resume auto-rotate after inactivity
let autoRotateTimeout;
canvas.addEventListener('pointerup', () => {
  clearTimeout(autoRotateTimeout);
  autoRotateTimeout = setTimeout(() => {
    controls.autoRotate = true;
  }, 5000);
});

// Hide loading after textures load (fallback)
setTimeout(() => {
  document.getElementById('loading').classList.add('hidden');
}, 3000);

animate();

