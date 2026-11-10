'use strict';

function startViewer() {
  const canvas = document.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 80);
  const material = new THREE.MeshStandardMaterial({ color: 0x43c500, roughness: 0.63 });
  const upperBore = 0.52;
  const lowerBore = 0.40;
  const outerRadius = 0.69;
  const drillY = 0.56;
  const drillRadius = 0.135;
  const shoulderY = -0.28;

  function hole(shape, x, y, radius) {
    const path = new THREE.Path();
    path.absarc(x, y, radius, 0, Math.PI * 2, true);
    shape.holes.push(path);
  }

  function extrude(shape, depth) {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth, curveSegments: 48, bevelEnabled: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    return mesh;
  }

  function plate(width, length, corner, thickness, underside, boltRadius, inset, bore) {
    const x = width / 2;
    const y = length / 2;
    const shape = new THREE.Shape();
    shape.absarc(x - corner, -y + corner, corner, -Math.PI / 2, 0);
    shape.absarc(x - corner, y - corner, corner, 0, Math.PI / 2);
    shape.absarc(-x + corner, y - corner, corner, Math.PI / 2, Math.PI);
    shape.absarc(-x + corner, -y + corner, corner, Math.PI, Math.PI * 1.5);
    shape.closePath();
    hole(shape, 0, 0, bore);
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) {
        hole(shape, side * (x - inset), end * (y - inset), boltRadius);
      }
    }
    const mesh = extrude(shape, thickness);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = underside;
  }

  const bottomY = -1.00;
  const topY = 0.92;
  const topPlateSize = 2.38;
  plate(3.86, 2.70, 0.28, 0.40, bottomY - 0.40, 0.19, 0.32, lowerBore);
  plate(topPlateSize, topPlateSize, 0.19, 0.29, topY, 0.125, 0.22, upperBore);

  const interior = material.clone();
  interior.side = THREE.BackSide;
  interior.color.multiplyScalar(0.90);

  // Sample the drill circle and reuse its points on both cylindrical walls.
  const segments = 48;
  const drillCircle = Array.from({ length: segments + 1 }, (_, i) => {
    const angle = i * Math.PI * 2 / segments;
    return [drillRadius * Math.cos(angle), drillRadius * Math.sin(angle)];
  });

  function drilledWall(radius, bottom, top, surface) {
    const edge = Math.asin(drillRadius / radius);
    const columns = [];
    for (let i = 0; i < 48; i++) {
      columns.push([-Math.PI / 2 + (Math.PI / 2 - edge) * i / 48, 0]);
    }
    for (let i = segments / 2; i >= 0; i--) {
      const [x, y] = drillCircle[i];
      columns.push([Math.asin(x / radius), Math.abs(y)]);
    }
    for (let i = 1; i <= 48; i++) {
      columns.push([edge + (Math.PI / 2 - edge) * i / 48, 0]);
    }

    const positions = [], normals = [], indices = [];
    for (const offset of [0, Math.PI]) {
      const first = positions.length / 3;
      for (const [theta, gap] of columns) {
        const x = Math.sin(theta + offset);
        const z = Math.cos(theta + offset);
        for (const y of [bottom, drillY - gap, drillY + gap, top]) {
          positions.push(radius * x, y, radius * z);
          normals.push(x, 0, z);
        }
      }
      for (let i = 0; i < columns.length - 1; i++) {
        const a = first + 4 * i;
        indices.push(a, a + 4, a + 5, a, a + 5, a + 1);
        indices.push(a + 2, a + 6, a + 7, a + 2, a + 7, a + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    scene.add(new THREE.Mesh(geometry, surface));
  }

  drilledWall(outerRadius, bottomY, topY, material);
  drilledWall(upperBore, shoulderY, topY, interior);

  const lowerWall = new THREE.Mesh(
    new THREE.CylinderGeometry(lowerBore, lowerBore, shoulderY - bottomY, 192, 1, true),
    interior
  );
  lowerWall.position.y = (bottomY + shoulderY) / 2;
  scene.add(lowerWall);

  const shoulder = new THREE.Mesh(new THREE.RingGeometry(lowerBore, upperBore, 192), material);
  shoulder.rotation.x = -Math.PI / 2;
  shoulder.position.y = shoulderY;
  scene.add(shoulder);

  const ear = new THREE.Shape();
  const earRadius = 0.26;
  const earTop = topY - drillY;
  ear.moveTo(-earRadius, earTop);
  ear.lineTo(-earRadius, 0);
  ear.absarc(0, 0, earRadius, Math.PI, Math.PI * 2);
  ear.lineTo(earRadius, earTop);
  ear.closePath();
  hole(ear, 0, 0, drillRadius);

  const earFront = topPlateSize / 2;
  const earBack = 0.61;
  const drillSurface = material.clone();
  drillSurface.side = THREE.DoubleSide;
  for (const side of [1, -1]) {
    const lug = extrude(ear, earFront - earBack);
    lug.position.set(0, drillY, side * earBack);
    lug.rotation.y = side === 1 ? 0 : Math.PI;

    // The lining joins the central bore to the ear without crossing the cavity.
    const vertices = [], indices = [];
    for (const [x, y] of drillCircle) {
      const innerZ = Math.sqrt(upperBore ** 2 - x ** 2);
      vertices.push(x, drillY + y, side * innerZ, x, drillY + y, side * earBack);
    }
    for (let i = 0; i < segments * 2; i += 2) {
      indices.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    scene.add(new THREE.Mesh(geometry, drillSurface));
  }

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9d1aa, 1.24));
  const key = new THREE.DirectionalLight(0xffffff, 2.05);
  key.position.set(3, 6, 4);
  scene.add(key);

  const initial = { azimuth: 0.80, elevation: 0.35 };
  let { azimuth, elevation } = initial;
  let pointer;
  let distance = 10;

  function render() {
    const cos = Math.cos(elevation);
    camera.position.set(
      distance * Math.sin(azimuth) * cos,
      distance * Math.sin(elevation) - 0.08,
      distance * Math.cos(azimuth) * cos
    );
    camera.lookAt(0, -0.08, 0);
    renderer.render(scene, camera);
  }

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    const halfHeight = Math.max(2.74, 2.78 / aspect);
    distance = halfHeight / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    render();
  }

  function orbit(dx, dy) {
    azimuth -= dx;
    elevation = THREE.MathUtils.clamp(elevation + dy, -1.55, 1.55);
    render();
  }

  canvas.addEventListener('pointerdown', event => {
    if (pointer || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(pointer.id);
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer?.id) return;
    const speed = 4 / Math.min(canvas.clientWidth, canvas.clientHeight);
    orbit((event.clientX - pointer.x) * speed, (event.clientY - pointer.y) * speed);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  canvas.addEventListener('lostpointercapture', event => {
    if (event.pointerId === pointer?.id) pointer = undefined;
  });
  canvas.addEventListener('keydown', event => {
    switch (event.key) {
      case 'ArrowLeft': orbit(-0.12, 0); break;
      case 'ArrowRight': orbit(0.12, 0); break;
      case 'ArrowUp': orbit(0, -0.12); break;
      case 'ArrowDown': orbit(0, 0.12); break;
      case 'Home':
        ({ azimuth, elevation } = initial);
        render();
        break;
      default: return;
    }
    event.preventDefault();
  });

  window.addEventListener('resize', resize);
  resize();
}

try {
  startViewer();
} catch (error) {
  console.error(error);
  const message = document.createElement('p');
  message.textContent = '无法加载 3D 模型，请使用支持 WebGL 的浏览器打开。';
  document.body.append(message);
}







