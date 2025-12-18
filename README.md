# Globe Explorer 🌍

An interactive 3D Earth globe exploration experience built with Three.js.

## Features

- **Spin the Globe**: Click and drag to rotate the Earth in any direction
- **Zoom In/Out**: Use scroll wheel to zoom closer or further from Earth
- **Auto-rotation**: The globe slowly rotates when idle
- **Atmospheric Effects**: Beautiful atmosphere glow and cloud layer
- **Starfield Background**: Procedurally generated stars with varied colors
- **Real-time Coordinates**: View latitude, longitude, and altitude as you explore

## Visualization

The globe uses a multi-layered Three.js approach:

- **Earth Sphere**: High-resolution sphere (128×128 segments) with custom shader material
- **Day/Night Shader**: Real-time blending between day (blue marble) and night (city lights) textures based on actual UTC time, with smooth terminator transitions and twilight effects
- **Clouds Layer**: Transparent sphere layer that fades on the night side
- **Atmosphere Glow**: Backside-rendered additive blending for atmospheric halo effect
- **Textures**: NASA Blue Marble imagery loaded from CDN (day surface, night lights, clouds, topology)

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm run dev
   ```

3. Open your browser to the URL shown in the terminal (typically http://localhost:5173)

## Controls

- **Left Click + Drag**: Rotate the globe
- **Scroll Wheel**: Zoom in/out
- **Auto-rotate**: Resumes after 5 seconds of inactivity

## Tech Stack

- [Three.js](https://threejs.org/) - 3D graphics library
- [Vite](https://vitejs.dev/) - Build tool and dev server
- NASA Blue Marble textures for realistic Earth imagery

## Build for Production

```bash
npm run build
```

The output will be in the `dist` folder.
