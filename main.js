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

// Earth textures
const earthDayTexture = textureLoader.load(
  'https://unpkg.com/three-globe@2.31.1/example/img/earth-blue-marble.jpg'
);
const earthNightTexture = textureLoader.load(
  'https://unpkg.com/three-globe@2.31.1/example/img/earth-night.jpg'
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

// Moon texture
const moonTexture = textureLoader.load(
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/moon_1024.jpg'
);

// Constants
const EARTH_RADIUS = 1.5;
const MOON_RADIUS = EARTH_RADIUS * 0.27; // Moon is ~27% of Earth's diameter
const MOON_ORBIT_RADIUS = EARTH_RADIUS * 8; // Scaled down from real 60x for visibility
const MOON_ORBITAL_PERIOD = 27.3; // days
const ISS_ALTITUDE = 408; // km
const EARTH_REAL_RADIUS = 6371; // km
const ISS_ORBIT_RADIUS = EARTH_RADIUS * (1 + ISS_ALTITUDE / EARTH_REAL_RADIUS);

// ============================================
// DAY/NIGHT EARTH SHADER
// ============================================

// Calculate sun position based on current time
function getSunPosition() {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  
  // Sun longitude (based on time of day)
  const sunLon = -((hour / 24) * 360 - 180);
  
  // Sun latitude (based on Earth's axial tilt and day of year)
  const axialTilt = 23.44;
  const sunLat = axialTilt * Math.sin((2 * Math.PI * (dayOfYear - 81)) / 365);
  
  // Convert to 3D position
  const phi = THREE.MathUtils.degToRad(90 - sunLat);
  const theta = THREE.MathUtils.degToRad(sunLon + 180);
  
  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  ).normalize();
}

// Custom shader for day/night Earth
const earthShaderMaterial = new THREE.ShaderMaterial({
  uniforms: {
    dayTexture: { value: earthDayTexture },
    nightTexture: { value: earthNightTexture },
    bumpTexture: { value: bumpTexture },
    sunDirection: { value: getSunPosition() },
    bumpScale: { value: 0.02 },
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormalWorld;
    varying vec3 vPositionWorld;
    
    void main() {
      vUv = uv;
      // Transform normal to WORLD space (not view space)
      vNormalWorld = normalize(mat3(modelMatrix) * normal);
      vPositionWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D dayTexture;
    uniform sampler2D nightTexture;
    uniform vec3 sunDirection;
    
    varying vec2 vUv;
    varying vec3 vNormalWorld;
    varying vec3 vPositionWorld;
    
    void main() {
      // Sample textures
      vec4 dayColor = texture2D(dayTexture, vUv);
      vec4 nightColor = texture2D(nightTexture, vUv);
      
      // Calculate sun intensity using WORLD space normal
      vec3 normal = normalize(vNormalWorld);
      float sunIntensity = dot(normal, sunDirection);
      
      // Create smooth transition at terminator
      // The transition zone is about 10 degrees wide
      float terminator = smoothstep(-0.1, 0.2, sunIntensity);
      
      // Boost night lights (they're quite dim in the texture)
      vec4 boostedNight = nightColor * 1.8;
      boostedNight.rgb = pow(boostedNight.rgb, vec3(0.8)); // Gamma correction for glow
      
      // Add orange/yellow tint to city lights
      boostedNight.rgb *= vec3(1.0, 0.9, 0.7);
      
      // Mix day and night based on terminator
      vec4 finalColor = mix(boostedNight, dayColor, terminator);
      
      // Add atmospheric scattering at the terminator (sunrise/sunset colors)
      float twilight = smoothstep(-0.1, 0.0, sunIntensity) * smoothstep(0.2, 0.0, sunIntensity);
      vec3 twilightColor = vec3(1.0, 0.4, 0.2) * twilight * 0.3;
      finalColor.rgb += twilightColor;
      
      // Add slight ambient light so dark side isn't pure black
      finalColor.rgb += dayColor.rgb * 0.05;
      
      // Specular highlight for water (simple approximation)
      vec3 viewDir = normalize(cameraPosition - vPositionWorld);
      vec3 reflectDir = reflect(-sunDirection, normal);
      float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
      finalColor.rgb += vec3(1.0) * spec * 0.3 * max(sunIntensity, 0.0);
      
      gl_FragColor = finalColor;
    }
  `,
});

// Earth Geometry
const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 128, 128);
const earth = new THREE.Mesh(earthGeometry, earthShaderMaterial);
scene.add(earth);

// Clouds layer (only visible on day side)
const cloudsGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.013, 64, 64);
const cloudsMaterial = new THREE.ShaderMaterial({
  uniforms: {
    cloudsTexture: { value: cloudsTexture },
    sunDirection: { value: getSunPosition() },
  },
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vNormalWorld;
    
    void main() {
      vUv = uv;
      vNormalWorld = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D cloudsTexture;
    uniform vec3 sunDirection;
    
    varying vec2 vUv;
    varying vec3 vNormalWorld;
    
    void main() {
      vec4 clouds = texture2D(cloudsTexture, vUv);
      float sunIntensity = dot(normalize(vNormalWorld), sunDirection);
      
      // Clouds fade out on night side
      float dayFactor = smoothstep(-0.2, 0.3, sunIntensity);
      
      // Also reduce cloud visibility in twilight zone
      float cloudAlpha = clouds.r * 0.4 * dayFactor;
      
      gl_FragColor = vec4(1.0, 1.0, 1.0, cloudAlpha);
    }
  `,
  transparent: true,
  depthWrite: false,
});
const clouds = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
scene.add(clouds);

// Atmosphere glow
const atmosphereGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.066, 64, 64);
const atmosphereMaterial = new THREE.ShaderMaterial({
  uniforms: {
    sunDirection: { value: getSunPosition() },
  },
  vertexShader: `
    varying vec3 vNormal;
    varying vec3 vPosition;
    
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 sunDirection;
    
    varying vec3 vNormal;
    varying vec3 vPosition;
    
    void main() {
      float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
      
      // Vary atmosphere color based on sun position
      vec3 worldNormal = normalize(vPosition);
      float sunFacing = dot(worldNormal, sunDirection);
      
      // Blue atmosphere on day side, darker on night
      vec3 dayAtmo = vec3(0.3, 0.6, 1.0);
      vec3 nightAtmo = vec3(0.1, 0.15, 0.3);
      vec3 atmoColor = mix(nightAtmo, dayAtmo, smoothstep(-0.3, 0.3, sunFacing));
      
      gl_FragColor = vec4(atmoColor, 1.0) * intensity;
    }
  `,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
  transparent: true,
});
const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
scene.add(atmosphere);

// ============================================
// THE MOON
// ============================================

// Calculate moon position based on current date (lunar cycle)
function getMoonPosition() {
  const now = new Date();
  
  // Reference new moon: January 6, 2000
  const refNewMoon = new Date(2000, 0, 6, 18, 14);
  const daysSinceRef = (now - refNewMoon) / (1000 * 60 * 60 * 24);
  
  // Moon's orbital progress (0 to 1)
  const lunarPhase = (daysSinceRef % MOON_ORBITAL_PERIOD) / MOON_ORBITAL_PERIOD;
  
  // Moon's angle in its orbit (in radians)
  const moonAngle = lunarPhase * Math.PI * 2;
  
  // Moon's orbit is inclined ~5.1 degrees to Earth's equator
  const inclination = THREE.MathUtils.degToRad(5.1);
  
  // Calculate position
  const x = Math.cos(moonAngle) * MOON_ORBIT_RADIUS;
  const z = Math.sin(moonAngle) * MOON_ORBIT_RADIUS * Math.cos(inclination);
  const y = Math.sin(moonAngle) * MOON_ORBIT_RADIUS * Math.sin(inclination);
  
  return { position: new THREE.Vector3(x, y, z), phase: lunarPhase };
}

// Moon group (for easier positioning)
const moonGroup = new THREE.Group();
scene.add(moonGroup);

// Moon sphere
const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 32, 32);
const moonMaterial = new THREE.MeshPhongMaterial({
  map: moonTexture,
  bumpMap: moonTexture,
  bumpScale: 0.005,
  shininess: 2,
});
const moon = new THREE.Mesh(moonGeometry, moonMaterial);
moonGroup.add(moon);

// Moon subtle glow
const moonGlowGeometry = new THREE.SphereGeometry(MOON_RADIUS * 1.15, 32, 32);
const moonGlowMaterial = new THREE.ShaderMaterial({
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
      float intensity = pow(0.65 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
      gl_FragColor = vec4(0.8, 0.85, 1.0, 1.0) * intensity * 0.4;
    }
  `,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
  transparent: true,
});
const moonGlow = new THREE.Mesh(moonGlowGeometry, moonGlowMaterial);
moonGroup.add(moonGlow);

// Moon orbit path visualization
const moonOrbitGeometry = new THREE.BufferGeometry();
const moonOrbitPoints = [];
const moonOrbitSegments = 128;
for (let i = 0; i <= moonOrbitSegments; i++) {
  const angle = (i / moonOrbitSegments) * Math.PI * 2;
  const inclination = THREE.MathUtils.degToRad(5.1);
  moonOrbitPoints.push(
    Math.cos(angle) * MOON_ORBIT_RADIUS,
    Math.sin(angle) * MOON_ORBIT_RADIUS * Math.sin(inclination),
    Math.sin(angle) * MOON_ORBIT_RADIUS * Math.cos(inclination)
  );
}
moonOrbitGeometry.setAttribute('position', new THREE.Float32BufferAttribute(moonOrbitPoints, 3));

const moonOrbitMaterial = new THREE.LineBasicMaterial({
  color: 0xaaaacc,
  transparent: true,
  opacity: 0.1,
});
const moonOrbitLine = new THREE.Line(moonOrbitGeometry, moonOrbitMaterial);
scene.add(moonOrbitLine);

// Update moon position
function updateMoonPosition() {
  const { position, phase } = getMoonPosition();
  moonGroup.position.copy(position);
  
  // Make moon always face Earth (tidally locked)
  moonGroup.lookAt(0, 0, 0);
  
  // Update UI
  const moonPhaseEl = document.getElementById('moon-phase');
  if (moonPhaseEl) {
    const phaseNames = ['🌑 New', '🌒 Waxing Crescent', '🌓 First Quarter', '🌔 Waxing Gibbous', 
                        '🌕 Full', '🌖 Waning Gibbous', '🌗 Last Quarter', '🌘 Waning Crescent'];
    const phaseIndex = Math.floor(phase * 8) % 8;
    moonPhaseEl.textContent = phaseNames[phaseIndex];
  }
}

// Initial moon position
updateMoonPosition();

// ============================================
// SUN INDICATOR
// ============================================

// Visual sun indicator (small sun icon in the distance)
const sunIndicatorGeometry = new THREE.SphereGeometry(0.3, 32, 32);
const sunIndicatorMaterial = new THREE.MeshBasicMaterial({
  color: 0xffdd44,
  transparent: true,
  opacity: 0.9,
});
const sunIndicator = new THREE.Mesh(sunIndicatorGeometry, sunIndicatorMaterial);
scene.add(sunIndicator);

// Sun glow
const sunGlowGeometry = new THREE.SphereGeometry(0.5, 32, 32);
const sunGlowMaterial = new THREE.ShaderMaterial({
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
      float intensity = pow(0.8 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
      gl_FragColor = vec4(1.0, 0.9, 0.5, 1.0) * intensity;
    }
  `,
  blending: THREE.AdditiveBlending,
  side: THREE.BackSide,
  transparent: true,
});
const sunGlow = new THREE.Mesh(sunGlowGeometry, sunGlowMaterial);
scene.add(sunGlow);

function updateSunPosition() {
  const sunDir = getSunPosition();
  
  // Update shader uniforms
  earthShaderMaterial.uniforms.sunDirection.value = sunDir;
  cloudsMaterial.uniforms.sunDirection.value = sunDir;
  atmosphereMaterial.uniforms.sunDirection.value = sunDir;
  
  // Position sun indicator far away
  const sunDistance = 20;
  sunIndicator.position.copy(sunDir.clone().multiplyScalar(sunDistance));
  sunGlow.position.copy(sunIndicator.position);
  
  // Update main light to match sun position
  sunLight.position.copy(sunDir.clone().multiplyScalar(10));
}

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
orbitRing.rotation.x = THREE.MathUtils.degToRad(51.6);
scene.add(orbitRing);

// ISS State
let issPosition = { lat: 0, lon: 0 };
let issTargetPosition = { lat: 0, lon: 0 };
let issVelocity = 27600;
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
    
    // Update day/night indicator for ISS
    const issInDaylight = data.visibility === 'daylight';
    const issVisibility = document.getElementById('iss-visibility');
    if (issVisibility) {
      issVisibility.textContent = issInDaylight ? '☀️ Daylight' : '🌙 Night';
    }
    
    if (!issDataFetched) {
      issPosition = { ...issTargetPosition };
      issDataFetched = true;
    }
  } catch (error) {
    console.error('Failed to fetch ISS position:', error);
    issTargetPosition.lon += 0.5;
    if (issTargetPosition.lon > 180) issTargetPosition.lon -= 360;
  }
}

// Smooth interpolation for ISS position
function updateISSPosition() {
  const lerpFactor = 0.05;
  
  let lonDiff = issTargetPosition.lon - issPosition.lon;
  if (lonDiff > 180) lonDiff -= 360;
  if (lonDiff < -180) lonDiff += 360;
  
  issPosition.lat += (issTargetPosition.lat - issPosition.lat) * lerpFactor;
  issPosition.lon += lonDiff * lerpFactor;
  
  if (issPosition.lon > 180) issPosition.lon -= 360;
  if (issPosition.lon < -180) issPosition.lon += 360;
  
  const pos = latLonToPosition(issPosition.lat, issPosition.lon, ISS_ORBIT_RADIUS);
  issGroup.position.copy(pos);
  issGroup.lookAt(0, 0, 0);
  
  trailIndex = (trailIndex + 1) % TRAIL_LENGTH;
  const positions = issTrail.geometry.attributes.position.array;
  
  for (let i = TRAIL_LENGTH - 1; i > 0; i--) {
    positions[i * 3] = positions[(i - 1) * 3];
    positions[i * 3 + 1] = positions[(i - 1) * 3 + 1];
    positions[i * 3 + 2] = positions[(i - 1) * 3 + 2];
  }
  
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
  
  panel1.rotation.z += 0.01;
  panel2.rotation.z += 0.01;
}

// Fetch ISS position every 5 seconds
fetchISSPosition();
setInterval(fetchISSPosition, 5000);

// ============================================
// EARTHQUAKE TRACKER
// ============================================

// Earthquake visualization group
const earthquakeGroup = new THREE.Group();
scene.add(earthquakeGroup);

// Earthquake state
let earthquakes = [];
let earthquakeMeshes = [];
let earthquakesVisible = true;

// Get color based on magnitude (more subtle colors)
function getMagnitudeColor(mag) {
  if (mag >= 6.0) return new THREE.Color(0xff4444); // Red - major
  if (mag >= 4.5) return new THREE.Color(0xff8855); // Orange - moderate  
  if (mag >= 2.5) return new THREE.Color(0xddaa44); // Yellow/amber - light
  return new THREE.Color(0x88cc66); // Soft green - minor
}

// Get beam height based on magnitude
function getMagnitudeHeight(mag) {
  const baseHeight = 0.08;
  return baseHeight + (mag / 10) * 0.25;
}

// Create earthquake visualization with vertical light beam
function createEarthquakePulse(lat, lon, magnitude, depth, id) {
  const group = new THREE.Group();
  
  // Store position for audio calculations
  const worldPos = latLonToPosition(lat, lon, EARTH_RADIUS * 1.001);
  group.userData = { id, magnitude, depth, lat, lon, worldPos };
  
  // Position on globe surface
  group.position.copy(worldPos);
  
  // Orient to point outward from Earth center
  group.lookAt(0, 0, 0);
  group.rotateX(Math.PI / 2);
  
  const color = getMagnitudeColor(magnitude);
  const height = getMagnitudeHeight(magnitude);
  const baseWidth = 0.008 + (magnitude / 10) * 0.015;
  
  // Vertical light beam (cone shape - wider at base)
  const beamGeometry = new THREE.ConeGeometry(baseWidth, height, 8, 1, true);
  beamGeometry.translate(0, height / 2, 0); // Move pivot to bottom
  
  const beamMaterial = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beam = new THREE.Mesh(beamGeometry, beamMaterial);
  beam.userData = { isBeam: true, baseOpacity: 0.6 };
  group.add(beam);
  
  // Inner glow beam (brighter, thinner)
  const innerBeamGeometry = new THREE.ConeGeometry(baseWidth * 0.4, height * 0.9, 6, 1, true);
  innerBeamGeometry.translate(0, height * 0.45, 0);
  
  const innerBeamMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const innerBeam = new THREE.Mesh(innerBeamGeometry, innerBeamMaterial);
  innerBeam.userData = { isInnerBeam: true };
  group.add(innerBeam);
  
  // Base glow (epicenter marker)
  const baseGeometry = new THREE.CircleGeometry(baseWidth * 2, 16);
  const baseMaterial = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.userData = { isBase: true };
  group.add(base);
  
  // Outer glow ring
  const glowRingGeometry = new THREE.RingGeometry(baseWidth * 2, baseWidth * 3.5, 24);
  const glowRingMaterial = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.25,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const glowRing = new THREE.Mesh(glowRingGeometry, glowRingMaterial);
  glowRing.userData = { isGlowRing: true, baseScale: 1 };
  group.add(glowRing);
  
  return group;
}

// Toggle earthquake visibility
function toggleEarthquakes() {
  earthquakesVisible = !earthquakesVisible;
  earthquakeGroup.visible = earthquakesVisible;
  
  // Update toggle button
  const toggleBtn = document.getElementById('quake-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = earthquakesVisible ? 'HIDE' : 'SHOW';
    toggleBtn.classList.toggle('toggle-off', !earthquakesVisible);
  }
  
  // Mute audio if hidden
  if (!earthquakesVisible) {
    updateEarthquakeAudio(0);
  }
}

// Expose toggle to window for button onclick
window.toggleEarthquakes = toggleEarthquakes;

// Toggle all panels visibility
let allPanelsVisible = true;
function toggleAllPanels() {
  allPanelsVisible = !allPanelsVisible;
  
  const panels = [
    '.iss-panel',
    '.moon-panel',
    '.quake-panel',
    '.asteroid-panel',
    '.time-display',
    '.coordinates-display',
    '.controls-hint'
  ];
  
  panels.forEach(selector => {
    const panel = document.querySelector(selector);
    if (panel) {
      panel.style.display = allPanelsVisible ? '' : 'none';
    }
  });
  
  // Update toggle button
  const toggleBtn = document.getElementById('panels-toggle');
  if (toggleBtn) {
    const toggleText = toggleBtn.querySelector('.toggle-text');
    const toggleIcon = toggleBtn.querySelector('.toggle-icon');
    if (toggleText) {
      toggleText.textContent = allPanelsVisible ? 'HIDE PANELS' : 'SHOW PANELS';
    }
    if (toggleIcon) {
      toggleIcon.textContent = allPanelsVisible ? '👁' : '👁‍🗨';
    }
    toggleBtn.classList.toggle('panels-hidden', !allPanelsVisible);
  }
}

// Expose toggle to window for button onclick
window.toggleAllPanels = toggleAllPanels;

// Fetch earthquake data from USGS
async function fetchEarthquakes() {
  try {
    // Get all earthquakes from the last 24 hours (magnitude 2.5+)
    const response = await fetch(
      'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'
    );
    const data = await response.json();
    
    // Clear existing earthquake meshes
    earthquakeMeshes.forEach(mesh => {
      earthquakeGroup.remove(mesh);
      mesh.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    });
    earthquakeMeshes = [];
    
    // Process earthquake data
    earthquakes = data.features.map(feature => ({
      id: feature.id,
      magnitude: feature.properties.mag,
      place: feature.properties.place,
      time: feature.properties.time,
      lat: feature.geometry.coordinates[1],
      lon: feature.geometry.coordinates[0],
      depth: feature.geometry.coordinates[2],
    }));
    
    // Create visualizations for each earthquake
    earthquakes.forEach(quake => {
      const mesh = createEarthquakePulse(
        quake.lat,
        quake.lon,
        quake.magnitude,
        quake.depth,
        quake.id
      );
      earthquakeGroup.add(mesh);
      earthquakeMeshes.push(mesh);
    });
    
    // Update UI
    updateEarthquakeUI();
    
    console.log(`Loaded ${earthquakes.length} earthquakes`);
  } catch (error) {
    console.error('Failed to fetch earthquake data:', error);
  }
}

// Update earthquake statistics in UI
function updateEarthquakeUI() {
  const countEl = document.getElementById('quake-count');
  const maxMagEl = document.getElementById('quake-max-mag');
  const lastLocationEl = document.getElementById('quake-last-location');
  
  if (countEl) {
    countEl.textContent = earthquakes.length;
  }
  
  if (maxMagEl && earthquakes.length > 0) {
    const maxMag = Math.max(...earthquakes.map(q => q.magnitude));
    maxMagEl.textContent = `M${maxMag.toFixed(1)}`;
  }
  
  if (lastLocationEl && earthquakes.length > 0) {
    // Most recent earthquake
    const sorted = [...earthquakes].sort((a, b) => b.time - a.time);
    const recent = sorted[0];
    // Truncate location name
    const location = recent.place.length > 25 
      ? recent.place.slice(0, 25) + '...' 
      : recent.place;
    lastLocationEl.textContent = location;
  }
}

// ============================================
// EARTHQUAKE AUDIO SYSTEM
// ============================================

let audioContext = null;
let earthquakeOscillators = [];
let earthquakeGain = null;
let audioInitialized = false;

function initAudio() {
  if (audioInitialized) return;
  
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Master gain for earthquake sounds
    earthquakeGain = audioContext.createGain();
    earthquakeGain.gain.value = 0;
    earthquakeGain.connect(audioContext.destination);
    
    // Create layered rumble oscillators
    const frequencies = [30, 45, 60, 80]; // Low rumble frequencies
    frequencies.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const oscGain = audioContext.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = freq;
      oscGain.gain.value = 0.3 - i * 0.05; // Layer volumes
      
      osc.connect(oscGain);
      oscGain.connect(earthquakeGain);
      osc.start();
      
      earthquakeOscillators.push({ osc, gain: oscGain });
    });
    
    // Add noise for texture
    const bufferSize = 2 * audioContext.sampleRate;
    const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioContext.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    
    const noiseFilter = audioContext.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 100;
    
    const noiseGain = audioContext.createGain();
    noiseGain.gain.value = 0.15;
    
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(earthquakeGain);
    noise.start();
    
    audioInitialized = true;
    console.log('Earthquake audio initialized');
  } catch (e) {
    console.log('Web Audio not supported');
  }
}

// Update earthquake audio based on proximity
function updateEarthquakeAudio(intensity) {
  if (!audioInitialized || !earthquakeGain) return;
  
  // Smooth volume transition
  const targetVolume = Math.min(intensity * 0.4, 0.5); // Max volume 0.5
  earthquakeGain.gain.linearRampToValueAtTime(
    targetVolume,
    audioContext.currentTime + 0.1
  );
  
  // Vary oscillator frequencies slightly based on intensity for rumble effect
  earthquakeOscillators.forEach((osc, i) => {
    const baseFreq = [30, 45, 60, 80][i];
    const wobble = Math.sin(Date.now() * 0.003 + i) * 5 * intensity;
    osc.osc.frequency.linearRampToValueAtTime(
      baseFreq + wobble,
      audioContext.currentTime + 0.1
    );
  });
}

// Calculate closest earthquake and update audio
function calculateEarthquakeProximity() {
  if (!earthquakesVisible || earthquakes.length === 0) {
    updateEarthquakeAudio(0);
    return;
  }
  
  let closestDistance = Infinity;
  let closestMagnitude = 0;
  
  earthquakeMeshes.forEach(group => {
    if (group.userData.worldPos) {
      const distance = camera.position.distanceTo(group.userData.worldPos);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestMagnitude = group.userData.magnitude;
      }
    }
  });
  
  // Calculate intensity based on distance and magnitude
  // Closer = louder, bigger magnitude = louder
  const maxDistance = 4; // Start hearing at this distance
  const minDistance = 1.8; // Max volume at this distance (zoomed in close)
  
  if (closestDistance < maxDistance) {
    const distanceFactor = 1 - ((closestDistance - minDistance) / (maxDistance - minDistance));
    const magnitudeFactor = closestMagnitude / 8; // Normalize magnitude
    const intensity = Math.max(0, distanceFactor * magnitudeFactor);
    updateEarthquakeAudio(intensity);
  } else {
    updateEarthquakeAudio(0);
  }
}

// Initialize audio on first user interaction
canvas.addEventListener('click', () => initAudio(), { once: true });
canvas.addEventListener('touchstart', () => initAudio(), { once: true });

// ============================================
// EARTHQUAKE ANIMATION
// ============================================

let earthquakeTime = 0;
function animateEarthquakes() {
  if (!earthquakesVisible) return;
  
  earthquakeTime += 0.03;
  
  earthquakeMeshes.forEach(group => {
    const mag = group.userData.magnitude || 3;
    const phaseOffset = group.userData.lat * 0.1; // Unique phase per quake
    
    group.children.forEach(child => {
      if (child.userData.isBeam) {
        // Flickering beam effect
        const flicker = 0.5 + Math.sin(earthquakeTime * 3 + phaseOffset) * 0.2 
                      + Math.sin(earthquakeTime * 7 + phaseOffset * 2) * 0.1;
        child.material.opacity = child.userData.baseOpacity * flicker;
        
        // Subtle height pulse
        const heightPulse = 1 + Math.sin(earthquakeTime * 2 + phaseOffset) * 0.1;
        child.scale.y = heightPulse;
      }
      
      if (child.userData.isInnerBeam) {
        // Brighter flicker for inner beam
        const flicker = 0.3 + Math.sin(earthquakeTime * 5 + phaseOffset) * 0.2;
        child.material.opacity = flicker;
      }
      
      if (child.userData.isBase) {
        // Pulsing epicenter
        const pulse = 0.7 + Math.sin(earthquakeTime * 2 + phaseOffset) * 0.2;
        child.material.opacity = pulse;
      }
      
      if (child.userData.isGlowRing) {
        // Expanding glow ring
        const expandSpeed = 1.5;
        const progress = ((earthquakeTime * expandSpeed + phaseOffset) % 2) / 2;
        const scale = 1 + progress * 1.5;
        child.scale.set(scale, scale, 1);
        child.material.opacity = 0.25 * (1 - progress);
      }
    });
  });
  
  // Update proximity audio
  calculateEarthquakeProximity();
}

// Fetch earthquakes every 5 minutes
fetchEarthquakes();
setInterval(fetchEarthquakes, 5 * 60 * 1000);

// ============================================
// ASTEROID IMPACT SIMULATOR 💥
// ============================================

// Raycaster for click detection
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Active impacts array
const activeImpacts = [];

// Camera shake state
let cameraShake = { intensity: 0, decay: 0.95 };
const originalCameraPosition = new THREE.Vector3();

// Create explosion flash
function createExplosionFlash(position) {
  const flashGeometry = new THREE.SphereGeometry(0.1, 16, 16);
  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 1,
  });
  const flash = new THREE.Mesh(flashGeometry, flashMaterial);
  flash.position.copy(position);
  return flash;
}

// Create shockwave ring
function createShockwave(position, normal) {
  const ringGeometry = new THREE.RingGeometry(0.01, 0.03, 64);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xff4400,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.copy(position);
  
  // Orient ring to face outward from Earth
  ring.lookAt(new THREE.Vector3(0, 0, 0));
  
  return ring;
}

// Create fire debris particles
function createDebrisParticles(position, count = 50) {
  const particles = [];
  
  for (let i = 0; i < count; i++) {
    const geometry = new THREE.SphereGeometry(0.008 + Math.random() * 0.015, 8, 8);
    
    // Random fire colors
    const colors = [0xff4400, 0xff6600, 0xff8800, 0xffaa00, 0xffcc00];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    const material = new THREE.MeshBasicMaterial({
      color: color,
      transparent: true,
      opacity: 1,
    });
    
    const particle = new THREE.Mesh(geometry, material);
    particle.position.copy(position);
    
    // Random velocity outward from Earth center + explosion direction
    const direction = position.clone().normalize();
    const randomOffset = new THREE.Vector3(
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 0.5
    );
    
    particle.userData.velocity = direction.add(randomOffset).normalize().multiplyScalar(0.02 + Math.random() * 0.04);
    particle.userData.life = 1;
    particle.userData.decay = 0.015 + Math.random() * 0.01;
    
    particles.push(particle);
  }
  
  return particles;
}

// Create secondary shockwave (bigger, slower)
function createSecondaryWave(position) {
  const ringGeometry = new THREE.RingGeometry(0.01, 0.02, 64);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0xff8800,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.copy(position);
  ring.lookAt(new THREE.Vector3(0, 0, 0));
  return ring;
}

// Create ground scorch mark
function createScorchMark(position) {
  const scorchGeometry = new THREE.CircleGeometry(0.08, 32);
  const scorchMaterial = new THREE.MeshBasicMaterial({
    color: 0x331100,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const scorch = new THREE.Mesh(scorchGeometry, scorchMaterial);
  scorch.position.copy(position.clone().normalize().multiplyScalar(EARTH_RADIUS * 1.001));
  scorch.lookAt(new THREE.Vector3(0, 0, 0));
  return scorch;
}

// Create complete impact effect
function createImpact(position) {
  const impact = {
    time: 0,
    position: position.clone(),
    flash: createExplosionFlash(position),
    shockwaves: [],
    secondaryWaves: [],
    particles: createDebrisParticles(position, 60),
    scorch: createScorchMark(position),
    complete: false,
  };
  
  // Add initial shockwave
  impact.shockwaves.push(createShockwave(position));
  
  // Add all objects to scene
  scene.add(impact.flash);
  scene.add(impact.scorch);
  impact.shockwaves.forEach(s => scene.add(s));
  impact.particles.forEach(p => scene.add(p));
  
  // Trigger camera shake
  cameraShake.intensity = 0.15;
  originalCameraPosition.copy(camera.position);
  
  // Update impact counter
  updateImpactCounter();
  
  return impact;
}

// Impact counter
let totalImpacts = 0;
function updateImpactCounter() {
  totalImpacts++;
  const counterEl = document.getElementById('impact-count');
  if (counterEl) {
    counterEl.textContent = totalImpacts;
  }
}

// Animate all active impacts
function animateImpacts() {
  for (let i = activeImpacts.length - 1; i >= 0; i--) {
    const impact = activeImpacts[i];
    impact.time += 0.016; // ~60fps
    
    // Flash animation (quick bright flash then fade)
    if (impact.flash) {
      if (impact.time < 0.1) {
        // Expand and brighten
        const scale = 1 + impact.time * 30;
        impact.flash.scale.setScalar(scale);
        impact.flash.material.opacity = 1;
        impact.flash.material.color.setHex(0xffffff);
      } else if (impact.time < 0.4) {
        // Fade to orange
        const fade = 1 - ((impact.time - 0.1) / 0.3);
        impact.flash.material.opacity = fade;
        impact.flash.material.color.setHex(0xff6600);
        impact.flash.scale.setScalar(4 + (impact.time - 0.1) * 5);
      } else {
        scene.remove(impact.flash);
        impact.flash.geometry.dispose();
        impact.flash.material.dispose();
        impact.flash = null;
      }
    }
    
    // Shockwave expansion
    impact.shockwaves.forEach((wave, index) => {
      const age = impact.time - index * 0.1;
      if (age > 0) {
        const scale = 1 + age * 8;
        wave.scale.setScalar(scale);
        wave.material.opacity = Math.max(0, 0.9 - age * 0.8);
        
        // Update ring size as it expands
        if (wave.material.opacity <= 0) {
          scene.remove(wave);
          wave.geometry.dispose();
          wave.material.dispose();
        }
      }
    });
    impact.shockwaves = impact.shockwaves.filter(w => w.material.opacity > 0);
    
    // Add new shockwaves over time
    if (impact.time > 0.15 && impact.shockwaves.length < 3) {
      const newWave = createShockwave(impact.position);
      impact.shockwaves.push(newWave);
      scene.add(newWave);
    }
    if (impact.time > 0.3 && impact.secondaryWaves.length < 2) {
      const newWave = createSecondaryWave(impact.position);
      impact.secondaryWaves.push(newWave);
      scene.add(newWave);
    }
    
    // Secondary wave expansion (slower, bigger)
    impact.secondaryWaves.forEach((wave, index) => {
      const age = impact.time - 0.3 - index * 0.2;
      if (age > 0) {
        const scale = 1 + age * 5;
        wave.scale.setScalar(scale);
        wave.material.opacity = Math.max(0, 0.6 - age * 0.4);
        
        if (wave.material.opacity <= 0) {
          scene.remove(wave);
          wave.geometry.dispose();
          wave.material.dispose();
        }
      }
    });
    impact.secondaryWaves = impact.secondaryWaves.filter(w => w.material.opacity > 0);
    
    // Particle animation
    impact.particles.forEach(particle => {
      if (particle.userData.life > 0) {
        // Move particle
        particle.position.add(particle.userData.velocity);
        
        // Slow down (air resistance)
        particle.userData.velocity.multiplyScalar(0.97);
        
        // Add gravity toward Earth
        const toCenter = particle.position.clone().normalize().multiplyScalar(-0.001);
        particle.userData.velocity.add(toCenter);
        
        // Fade out
        particle.userData.life -= particle.userData.decay;
        particle.material.opacity = particle.userData.life;
        
        // Shrink
        const shrink = 0.5 + particle.userData.life * 0.5;
        particle.scale.setScalar(shrink);
        
        if (particle.userData.life <= 0) {
          scene.remove(particle);
          particle.geometry.dispose();
          particle.material.dispose();
        }
      }
    });
    impact.particles = impact.particles.filter(p => p.userData.life > 0);
    
    // Scorch mark fade in then persist
    if (impact.scorch) {
      if (impact.time < 0.3) {
        impact.scorch.material.opacity = (impact.time / 0.3) * 0.7;
      }
      // Scorch marks slowly fade after 5 seconds
      if (impact.time > 5) {
        impact.scorch.material.opacity -= 0.01;
        if (impact.scorch.material.opacity <= 0) {
          scene.remove(impact.scorch);
          impact.scorch.geometry.dispose();
          impact.scorch.material.dispose();
          impact.scorch = null;
        }
      }
    }
    
    // Check if impact is complete
    if (!impact.flash && 
        impact.shockwaves.length === 0 && 
        impact.secondaryWaves.length === 0 && 
        impact.particles.length === 0 &&
        !impact.scorch) {
      impact.complete = true;
    }
    
    // Remove completed impacts
    if (impact.complete) {
      activeImpacts.splice(i, 1);
    }
  }
  
  // Camera shake
  if (cameraShake.intensity > 0.001) {
    const shakeX = (Math.random() - 0.5) * cameraShake.intensity;
    const shakeY = (Math.random() - 0.5) * cameraShake.intensity;
    const shakeZ = (Math.random() - 0.5) * cameraShake.intensity * 0.5;
    
    camera.position.x = originalCameraPosition.x + shakeX;
    camera.position.y = originalCameraPosition.y + shakeY;
    camera.position.z = originalCameraPosition.z + shakeZ;
    
    cameraShake.intensity *= cameraShake.decay;
  } else if (cameraShake.intensity > 0) {
    camera.position.copy(originalCameraPosition);
    cameraShake.intensity = 0;
  }
}

// Handle double-click to create impact (doesn't interfere with drag-to-rotate)
function onGlobeDoubleClick(event) {
  // Calculate mouse position in normalized device coordinates
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  
  // Update raycaster
  raycaster.setFromCamera(mouse, camera);
  
  // Check intersection with Earth
  const intersects = raycaster.intersectObject(earth);
  
  if (intersects.length > 0) {
    const hitPoint = intersects[0].point;
    // Move impact point slightly above surface
    const impactPosition = hitPoint.clone().normalize().multiplyScalar(EARTH_RADIUS * 1.01);
    
    const impact = createImpact(impactPosition);
    activeImpacts.push(impact);
    
    // Stop auto-rotate on impact
    controls.autoRotate = false;
    
    console.log('💥 ASTEROID IMPACT!');
  }
}

// Add double-click listener for asteroid impacts
canvas.addEventListener('dblclick', onGlobeDoubleClick);

// Expose impact function for button
window.triggerRandomImpact = function() {
  // Random lat/lon
  const lat = (Math.random() - 0.5) * 180;
  const lon = (Math.random() - 0.5) * 360;
  const position = latLonToPosition(lat, lon, EARTH_RADIUS * 1.01);
  
  const impact = createImpact(position);
  activeImpacts.push(impact);
  
  console.log('💥 RANDOM ASTEROID IMPACT!');
};

// ============================================
// STARFIELD
// ============================================

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
    
    const colorChoice = Math.random();
    if (colorChoice > 0.95) {
      starColors.push(1, 0.8, 0.6);
    } else if (colorChoice > 0.9) {
      starColors.push(0.8, 0.9, 1);
    } else {
      starColors.push(1, 1, 1);
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

// ============================================
// LIGHTING
// ============================================

const ambientLight = new THREE.AmbientLight(0x404040, 0.15);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 2);
sunLight.position.set(5, 3, 5);
scene.add(sunLight);

// Initialize sun position (must be after sunLight is defined)
updateSunPosition();
setInterval(updateSunPosition, 60000);

// ============================================
// UI UPDATES
// ============================================

const latValue = document.getElementById('lat-value');
const lonValue = document.getElementById('lon-value');
const altValue = document.getElementById('alt-value');

function updateCoordinates() {
  const cameraPos = camera.position.clone().normalize();
  const lat = Math.asin(cameraPos.y) * (180 / Math.PI);
  const lon = Math.atan2(cameraPos.x, cameraPos.z) * (180 / Math.PI);
  const distance = camera.position.length();
  
  latValue.textContent = `${lat.toFixed(2)}°`;
  lonValue.textContent = `${lon.toFixed(2)}°`;
  altValue.textContent = `${(distance / 2).toFixed(1)}x`;
}

// Update time display
function updateTimeDisplay() {
  const now = new Date();
  const utcString = now.toUTCString().slice(17, 25);
  const timeDisplay = document.getElementById('utc-time');
  if (timeDisplay) {
    timeDisplay.textContent = utcString + ' UTC';
  }
}
setInterval(updateTimeDisplay, 1000);
updateTimeDisplay();

// ============================================
// ANIMATION LOOP
// ============================================

function animate() {
  requestAnimationFrame(animate);
  
  clouds.rotation.y += 0.0003;
  stars.rotation.y += 0.00005;
  
  // Slowly rotate moon (it orbits Earth every ~27 days, but speed up for visual effect)
  // Real-time update happens less frequently, this adds subtle movement
  moonGroup.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.0001);
  
  if (issDataFetched) {
    updateISSPosition();
    animateISS();
  }
  
  // Animate earthquake beams
  animateEarthquakes();
  
  // Animate asteroid impacts
  animateImpacts();
  
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
