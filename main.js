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

// Constants
const EARTH_RADIUS = 1.5;
const ISS_ALTITUDE = 408; // km
const EARTH_REAL_RADIUS = 6371; // km
const ISS_ORBIT_RADIUS = EARTH_RADIUS * (1 + ISS_ALTITUDE / EARTH_REAL_RADIUS);

// Earth Geometry
const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);

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
const cloudsGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.013, 64, 64);
const cloudsMaterial = new THREE.MeshPhongMaterial({
  map: cloudsTexture,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
});
const clouds = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
scene.add(clouds);

// Atmosphere glow
const atmosphereGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.066, 64, 64);
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

// ============================================
// ISS TRACKER
// ============================================

// ISS Group (contains all ISS-related objects)
const issGroup = new THREE.Group();
scene.add(issGroup);

// ISS Main body - glowing orb
const issGeometry = new THREE.SphereGeometry(0.03, 16, 16);
const issMaterial = new THREE.MeshBasicMaterial({
  color: 0x00ffff,
  transparent: true,
  opacity: 1,
});
const iss = new THREE.Mesh(issGeometry, issMaterial);
issGroup.add(iss);

// ISS Glow effect
const issGlowGeometry = new THREE.SphereGeometry(0.06, 16, 16);
const issGlowMaterial = new THREE.ShaderMaterial({
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
      float intensity = pow(0.9 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
      gl_FragColor = vec4(0.0, 1.0, 1.0, 1.0) * intensity * 0.8;
    }
  `,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
  transparent: true,
});
const issGlow = new THREE.Mesh(issGlowGeometry, issGlowMaterial);
issGroup.add(issGlow);

// ISS Solar panels (simple cross shape)
const panelGeometry = new THREE.BoxGeometry(0.15, 0.005, 0.02);
const panelMaterial = new THREE.MeshBasicMaterial({ 
  color: 0xffaa00,
  transparent: true,
  opacity: 0.9,
});
const panel1 = new THREE.Mesh(panelGeometry, panelMaterial);
const panel2 = new THREE.Mesh(panelGeometry, panelMaterial);
panel2.rotation.y = Math.PI / 2;
issGroup.add(panel1);
issGroup.add(panel2);

// ISS Orbital Trail
const TRAIL_LENGTH = 150;
const trailPositions = new Float32Array(TRAIL_LENGTH * 3);
const trailColors = new Float32Array(TRAIL_LENGTH * 3);

for (let i = 0; i < TRAIL_LENGTH; i++) {
  const alpha = 1 - (i / TRAIL_LENGTH);
  trailColors[i * 3] = 0;
  trailColors[i * 3 + 1] = alpha;
  trailColors[i * 3 + 2] = alpha;
}

const trailGeometry = new THREE.BufferGeometry();
trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));

const trailMaterial = new THREE.LineBasicMaterial({
  vertexColors: true,
  transparent: true,
  opacity: 0.6,
  linewidth: 2,
});

const issTrail = new THREE.Line(trailGeometry, trailMaterial);
scene.add(issTrail);

// ISS Orbit ring (full orbit visualization)
const orbitGeometry = new THREE.BufferGeometry();
const orbitPoints = [];
const orbitSegments = 128;
for (let i = 0; i <= orbitSegments; i++) {
  const angle = (i / orbitSegments) * Math.PI * 2;
  orbitPoints.push(
    Math.cos(angle) * ISS_ORBIT_RADIUS,
    0,
    Math.sin(angle) * ISS_ORBIT_RADIUS
  );
}
orbitGeometry.setAttribute('position', new THREE.Float32BufferAttribute(orbitPoints, 3));

const orbitMaterial = new THREE.LineBasicMaterial({
  color: 0x00ffff,
  transparent: true,
  opacity: 0.15,
});
const orbitRing = new THREE.Line(orbitGeometry, orbitMaterial);
// ISS orbit is inclined ~51.6 degrees
orbitRing.rotation.x = THREE.MathUtils.degToRad(51.6);
scene.add(orbitRing);

// ISS State
let issPosition = { lat: 0, lon: 0 };
let issTargetPosition = { lat: 0, lon: 0 };
let issVelocity = 27600; // km/h
let trailIndex = 0;
let issDataFetched = false;

// Convert lat/lon to 3D position
function latLonToPosition(lat, lon, radius) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

// Fetch ISS position from API
async function fetchISSPosition() {
  try {
    const response = await fetch('https://api.wheretheiss.at/v1/satellites/25544');
    const data = await response.json();
    
    issTargetPosition = {
      lat: data.latitude,
      lon: data.longitude,
    };
    issVelocity = data.velocity;
    
    // Update UI
    document.getElementById('iss-lat').textContent = `${data.latitude.toFixed(2)}°`;
    document.getElementById('iss-lon').textContent = `${data.longitude.toFixed(2)}°`;
    document.getElementById('iss-alt').textContent = `${data.altitude.toFixed(0)} km`;
    document.getElementById('iss-speed').textContent = `${data.velocity.toFixed(0)} km/h`;
    
    if (!issDataFetched) {
      issPosition = { ...issTargetPosition };
      issDataFetched = true;
    }
  } catch (error) {
    console.error('Failed to fetch ISS position:', error);
    // Simulate movement if API fails
    issTargetPosition.lon += 0.5;
    if (issTargetPosition.lon > 180) issTargetPosition.lon -= 360;
  }
}

// Smooth interpolation for ISS position
function updateISSPosition() {
  // Lerp towards target position
  const lerpFactor = 0.05;
  
  // Handle longitude wrap-around
  let lonDiff = issTargetPosition.lon - issPosition.lon;
  if (lonDiff > 180) lonDiff -= 360;
  if (lonDiff < -180) lonDiff += 360;
  
  issPosition.lat += (issTargetPosition.lat - issPosition.lat) * lerpFactor;
  issPosition.lon += lonDiff * lerpFactor;
  
  // Normalize longitude
  if (issPosition.lon > 180) issPosition.lon -= 360;
  if (issPosition.lon < -180) issPosition.lon += 360;
  
  // Update 3D position
  const pos = latLonToPosition(issPosition.lat, issPosition.lon, ISS_ORBIT_RADIUS);
  issGroup.position.copy(pos);
  
  // Make ISS face the direction of travel
  issGroup.lookAt(0, 0, 0);
  
  // Update trail
  trailIndex = (trailIndex + 1) % TRAIL_LENGTH;
  const positions = issTrail.geometry.attributes.position.array;
  
  // Shift trail positions
  for (let i = TRAIL_LENGTH - 1; i > 0; i--) {
    positions[i * 3] = positions[(i - 1) * 3];
    positions[i * 3 + 1] = positions[(i - 1) * 3 + 1];
    positions[i * 3 + 2] = positions[(i - 1) * 3 + 2];
  }
  
  // Add current position
  positions[0] = pos.x;
  positions[1] = pos.y;
  positions[2] = pos.z;
  
  issTrail.geometry.attributes.position.needsUpdate = true;
}

// ISS pulse animation
let issPulse = 0;
function animateISS() {
  issPulse += 0.05;
  const pulse = 1 + Math.sin(issPulse) * 0.2;
  issGlow.scale.setScalar(pulse);
  
  // Rotate solar panels
  panel1.rotation.z += 0.01;
  panel2.rotation.z += 0.01;
}

// Fetch ISS position every 5 seconds
fetchISSPosition();
setInterval(fetchISSPosition, 5000);

// ============================================
// END ISS TRACKER
// ============================================

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
  
  // Update ISS
  if (issDataFetched) {
    updateISSPosition();
    animateISS();
  }
  
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
