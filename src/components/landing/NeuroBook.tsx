import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * 3D Holographic Futuristic NeuroBook
 * Complete Real Book Turning Physics:
 * - Turns FRONT sheets from Right to Left (standard forward reading order).
 * - True 2-sided sheet (Front face & Back face) with inverted UVs on back:
 *   no mirrored/reversed text!
 * - When page turns: Front displays current right chapter, lifts forward into space (+Z),
 *   reveals next chapter underneath on right block, and Back displays the newly landed chapter!
 * - Receding projection into distance (camera looking slightly upward).
 * - Interactive mouse/touch 3D cursor tracking + trajectory banking.
 * - Smooth fade out before CTA and footer.
 */

export interface NeuroBookProps {
  embedded?: boolean;
  className?: string;
}

export const NeuroBook: React.FC<NeuroBookProps> = ({ embedded = false, className = '' }) => {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const getWidth = () =>
      embedded ? Math.max(container.clientWidth || 340, 220) : window.innerWidth;
    const getHeight = () =>
      embedded ? Math.max(container.clientHeight || 220, 180) : window.innerHeight;

    // --- 1. Scene, Camera, Renderer ---
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      embedded ? 36 : 40,
      getWidth() / getHeight(),
      0.1,
      1000
    );
    if (embedded) {
      camera.position.set(0, 0.15, 5.2);
      camera.lookAt(0, 0.1, 0);
    } else {
      // Camera positioned lower, looking slightly upward for receding perspective
      camera.position.set(0, -0.3, 6.8);
      camera.lookAt(0, 0.35, 0);
    }

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(getWidth(), getHeight());
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // 100% transparent background
    container.appendChild(renderer.domElement);

    // --- 2. Color Palette Constants ---
    const COLOR_WHITE = 0xf5f7ff;
    const COLOR_NEON_RED = 0xff173d;
    const COLOR_DARK_PAGE = 0x07080b;

    // --- 3. Master Groups ---
    const rootTrajectoryGroup = new THREE.Group();
    scene.add(rootTrajectoryGroup);

    const bookGroup = new THREE.Group();
    rootTrajectoryGroup.add(bookGroup);

    bookGroup.rotation.x = -0.36;
    bookGroup.rotation.y = 0.0;
    bookGroup.rotation.z = -0.04;

    // --- 4. High-Res Crisp Chapter Textures (4 Distinct Chapters) ---
    const chaptersData = [
      {
        num: '01',
        title: 'ГЛАВА 1: ПЕРСОНАЛЬНЫЙ РОМАН',
        sub: 'ФАБРИКА СЮЖЕТОВ // МОДЕЛЬ 0.9',
        lines: [
          'Главный герой — реальный человек.',
          'Связка каскада глав до 100 частей.',
          'Портретное сходство персонажей по фото.',
          'Плотность бумаги: 120г офсетная белая.',
          'Идеальный подарок к юбилею и торжеству.',
          'Тираж: ровно один уникальный том.',
        ],
        footer: 'СТР. 012 // ПЕЧАТЬ 300 DPI',
      },
      {
        num: '02',
        title: 'ГЛАВА 2: ТИПОГРАФИЯ В РФ',
        sub: 'ПОЛИГРАФИЧЕСКИЙ МАКЕТ А5',
        lines: [
          'Прямой расчет толщины корешка книги.',
          'Поля под обрезку 3 мм по стандарту ISO.',
          'Партнерская сеть типографий по всей стране.',
          'Быстрая доставка курьером или в СДЭК.',
          'Твердый переплет с выборочным лаком.',
          'Доступно каждому автору без посредников.',
        ],
        footer: 'СТР. 046 // ФОРМАТ А5',
      },
      {
        num: '03',
        title: 'ГЛАВА 3: ОНБОРДИНГ И B2B',
        sub: 'КОРПОРАТИВНЫЕ ГРАФИЧЕСКИЕ ТОМА',
        lines: [
          'Геймифицированная книга адаптации новичка.',
          'Премиальный подарок партнерам компании.',
          'Фиксация корпоративной культуры и истории.',
          'Интеграция корпоративного фирменного стиля.',
          'Сувенир, который хранят на рабочем столе.',
          'Тиражи от 1 до 500 экземпляров в срок.',
        ],
        footer: 'СТР. 078 // КОРПОРАТИВНЫЙ БЛОК',
      },
      {
        num: '04',
        title: 'ГЛАВА 4: ЧИТАЛКА И СЕТЬ',
        sub: 'ВИРУСНОЕ ОНЛАЙН-ЧТЕНИЕ',
        lines: [
          'Реалистичный трехмерный переплет онлайн.',
          'Шелест страниц и тактильная анимация.',
          'Публикация в каталоге в один клик.',
          'Бонусы за лайки и прочтения глав читателями.',
          'Реферальные баллы на печать новых томов.',
          'Свобода творчества в едином пространстве.',
        ],
        footer: 'СТР. 102 // ОНЛАЙН-КАТАЛОГ',
      },
    ];

    const createChapterTexture = (chapIdx: number): THREE.CanvasTexture => {
      const data = chaptersData[chapIdx % chaptersData.length];
      const canvas = document.createElement('canvas');
      canvas.width = 1536;
      canvas.height = 2048;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#08090d';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Technical coordinate grid
        ctx.strokeStyle = 'rgba(245, 247, 255, 0.06)';
        ctx.lineWidth = 2;
        for (let x = 0; x < canvas.width; x += 96) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += 96) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }

        // Bold neon red page frame
        ctx.strokeStyle = '#FF173D';
        ctx.lineWidth = 8;
        ctx.strokeRect(60, 60, canvas.width - 120, canvas.height - 120);

        ctx.strokeStyle = 'rgba(255, 23, 61, 0.4)';
        ctx.lineWidth = 3;
        ctx.strokeRect(88, 88, canvas.width - 176, canvas.height - 176);

        // Corner technical brackets
        const bLen = 60;
        ctx.strokeStyle = '#F5F7FF';
        ctx.lineWidth = 5;
        // TL
        ctx.beginPath();
        ctx.moveTo(50, 50 + bLen);
        ctx.lineTo(50, 50);
        ctx.lineTo(50 + bLen, 50);
        ctx.stroke();
        // TR
        ctx.beginPath();
        ctx.moveTo(canvas.width - 50 - bLen, 50);
        ctx.lineTo(canvas.width - 50, 50);
        ctx.lineTo(canvas.width - 50, 50 + bLen);
        ctx.stroke();
        // BL
        ctx.beginPath();
        ctx.moveTo(50, canvas.height - 50 - bLen);
        ctx.lineTo(50, canvas.height - 50);
        ctx.lineTo(50 + bLen, canvas.height - 50);
        ctx.stroke();
        // BR
        ctx.beginPath();
        ctx.moveTo(canvas.width - 50 - bLen, canvas.height - 50);
        ctx.lineTo(canvas.width - 50, canvas.height - 50);
        ctx.lineTo(canvas.width - 50, canvas.height - 50 - bLen);
        ctx.stroke();

        // Technical Header
        ctx.fillStyle = '#FF173D';
        ctx.font = 'bold 58px "Courier New", monospace';
        ctx.fillText(data.title, 120, 200);

        ctx.fillStyle = '#F5F7FF';
        ctx.font = 'bold 36px "Courier New", monospace';
        ctx.fillText(data.sub, 120, 270);

        ctx.fillStyle = '#FF173D';
        ctx.fillRect(120, 310, canvas.width - 240, 6);

        // Crisp Cyrillic Content Lines
        ctx.fillStyle = '#F5F7FF';
        ctx.font = 'bold 52px "PT Serif", Georgia, serif';
        let lineY = 460;
        data.lines.forEach((line) => {
          ctx.fillText(line, 120, lineY);
          lineY += 120;
        });

        // Technical Footer Box
        ctx.fillStyle = 'rgba(255, 23, 61, 0.12)';
        ctx.fillRect(120, lineY + 60, canvas.width - 240, 160);
        ctx.strokeStyle = '#FF173D';
        ctx.lineWidth = 3;
        ctx.strokeRect(120, lineY + 60, canvas.width - 240, 160);

        ctx.fillStyle = '#FF173D';
        ctx.font = 'bold 38px monospace';
        ctx.fillText(data.footer, 160, lineY + 130);

        ctx.fillStyle = '#F5F7FF';
        ctx.font = 'bold 34px monospace';
        ctx.fillText('KNIGAI NOIR SYSTEM', 160, lineY + 185);
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    };

    const chapterTextures = [
      createChapterTexture(0), // Chapter 1
      createChapterTexture(1), // Chapter 2
      createChapterTexture(2), // Chapter 3
      createChapterTexture(3), // Chapter 4
    ];

    // --- 5. Geometry & Dimensions ---
    const PAGE_W = 1.6;
    const PAGE_H = 2.3;
    const BOOK_DEPTH = 0.22;
    const OPEN_ANGLE = 0.14; // Angle of opened page stacks

    // Hardcovers
    const coverMat = new THREE.MeshStandardMaterial({
      color: 0x090a0f,
      roughness: 0.35,
      metalness: 0.85,
    });
    const coverEdgeMat = new THREE.MeshBasicMaterial({
      color: COLOR_NEON_RED,
      wireframe: true,
    });
    const coverGeo = new THREE.BoxGeometry(PAGE_W + 0.06, PAGE_H + 0.08, 0.035);

    const leftCover = new THREE.Mesh(coverGeo, coverMat);
    leftCover.position.set(-(PAGE_W / 2 + 0.03), 0, -BOOK_DEPTH / 2 - 0.015);
    leftCover.rotation.y = OPEN_ANGLE;
    bookGroup.add(leftCover);

    const leftCoverEdge = new THREE.Mesh(coverGeo, coverEdgeMat);
    leftCoverEdge.position.copy(leftCover.position);
    leftCoverEdge.rotation.copy(leftCover.rotation);
    leftCoverEdge.scale.set(1.002, 1.002, 1.002);
    bookGroup.add(leftCoverEdge);

    const rightCover = new THREE.Mesh(coverGeo, coverMat);
    rightCover.position.set(PAGE_W / 2 + 0.03, 0, -BOOK_DEPTH / 2 - 0.015);
    rightCover.rotation.y = -OPEN_ANGLE;
    bookGroup.add(rightCover);

    const rightCoverEdge = new THREE.Mesh(coverGeo, coverEdgeMat);
    rightCoverEdge.position.copy(rightCover.position);
    rightCoverEdge.rotation.copy(rightCover.rotation);
    rightCoverEdge.scale.set(1.002, 1.002, 1.002);
    bookGroup.add(rightCoverEdge);

    // Spine
    const spineRadius = 0.18;
    const spineGeo = new THREE.CylinderGeometry(
      spineRadius,
      spineRadius,
      PAGE_H + 0.08,
      24,
      8,
      true,
      Math.PI / 2,
      Math.PI
    );
    const spineMat = new THREE.MeshStandardMaterial({
      color: 0x050608,
      metalness: 0.9,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });
    const spine = new THREE.Mesh(spineGeo, spineMat);
    spine.rotation.y = Math.PI / 2;
    spine.position.set(0, 0, -BOOK_DEPTH / 2 - 0.06);
    bookGroup.add(spine);

    // Spine Neon Ribs
    const ribGroup = new THREE.Group();
    const ribGeo = new THREE.TorusGeometry(spineRadius + 0.012, 0.015, 12, 24, Math.PI);
    const ribMat = new THREE.MeshBasicMaterial({ color: COLOR_NEON_RED });
    [-0.9, -0.45, 0, 0.45, 0.9].forEach((yPos) => {
      const rib = new THREE.Mesh(ribGeo, ribMat);
      rib.rotation.y = Math.PI / 2;
      rib.position.set(0, yPos, -BOOK_DEPTH / 2 - 0.06);
      ribGroup.add(rib);
    });
    bookGroup.add(ribGroup);

    // Layered Page Stacks
    const pageBlockGeo = new THREE.BoxGeometry(PAGE_W, PAGE_H, BOOK_DEPTH);

    // Left Page Stack: Starts with Chapter 1 on top
    const leftBlockMat = [
      new THREE.MeshStandardMaterial({ color: COLOR_DARK_PAGE, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: COLOR_WHITE, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: COLOR_WHITE, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: COLOR_WHITE, roughness: 0.8 }),
      new THREE.MeshBasicMaterial({ map: chapterTextures[0] }), // Front page (Chapter 1)
      new THREE.MeshStandardMaterial({ color: COLOR_DARK_PAGE }),
    ];
    const leftBlock = new THREE.Mesh(pageBlockGeo, leftBlockMat);
    leftBlock.position.set(-PAGE_W / 2, 0, 0);
    leftBlock.rotation.y = OPEN_ANGLE;
    bookGroup.add(leftBlock);

    // Right Page Stack: Under the turning page is Chapter 4 (or next target chapter)
    const rightBlockMat = [
      new THREE.MeshStandardMaterial({ color: COLOR_WHITE, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: COLOR_DARK_PAGE, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ color: COLOR_WHITE, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: COLOR_WHITE, roughness: 0.8 }),
      new THREE.MeshBasicMaterial({ map: chapterTextures[3] }), // Page underneath on right (Chapter 4)
      new THREE.MeshStandardMaterial({ color: COLOR_DARK_PAGE }),
    ];
    const rightBlock = new THREE.Mesh(pageBlockGeo, rightBlockMat);
    rightBlock.position.set(PAGE_W / 2, 0, 0);
    rightBlock.rotation.y = -OPEN_ANGLE;
    bookGroup.add(rightBlock);

    // Page Block Edge Stripes
    const edgeLinesGeo = new THREE.BufferGeometry();
    const edgeLineVertices: number[] = [];
    for (let i = 0; i < 14; i++) {
      const zOffset = -BOOK_DEPTH / 2 + (i / 14) * BOOK_DEPTH;
      edgeLineVertices.push(-PAGE_W, -PAGE_H / 2, zOffset);
      edgeLineVertices.push(-PAGE_W, PAGE_H / 2, zOffset);
      edgeLineVertices.push(PAGE_W, -PAGE_H / 2, zOffset);
      edgeLineVertices.push(PAGE_W, PAGE_H / 2, zOffset);
    }
    edgeLinesGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgeLineVertices, 3));
    const edgeLinesMat = new THREE.LineBasicMaterial({
      color: COLOR_WHITE,
      transparent: true,
      opacity: 0.45,
    });
    const edgeLines = new THREE.LineSegments(edgeLinesGeo, edgeLinesMat);
    bookGroup.add(edgeLines);

    // --- 6. REAL 2-SIDED TURNING PAGE: FLIPPING FROM RIGHT TO LEFT ---
    // In standard forward reading, the reader turns the sheet on the RIGHT stack over to the LEFT stack!
    const TURN_SEGS_X = 40;
    const TURN_SEGS_Y = 24;

    // PlaneGeometry with origin at spine pivot (X=0): spans X in [0, PAGE_W]
    const turningFrontGeo = new THREE.PlaneGeometry(PAGE_W, PAGE_H, TURN_SEGS_X, TURN_SEGS_Y);
    turningFrontGeo.translate(PAGE_W / 2, 0, 0);
    const basePositions = turningFrontGeo.attributes.position.clone();

    // Front Material: displays Chapter 2 (facing reader on the right stack before turn)
    const turningFrontMat = new THREE.MeshBasicMaterial({
      map: chapterTextures[1], // Chapter 2
      side: THREE.FrontSide,
      depthTest: true,
      depthWrite: true,
    });
    const turningFrontMesh = new THREE.Mesh(turningFrontGeo, turningFrontMat);
    turningFrontMesh.position.set(0, 0, BOOK_DEPTH / 2 + 0.006);
    turningFrontMesh.renderOrder = 30;
    bookGroup.add(turningFrontMesh);

    // Back Material & Geometry: displays Chapter 3 (facing reader after landing on the left stack)
    // Inverted UV coordinates ensure text is 100% RIGHT-READING and NOT MIRRORED when viewed from the back!
    const turningBackGeo = turningFrontGeo.clone();
    const backUvAttr = turningBackGeo.attributes.uv;
    for (let i = 0; i < backUvAttr.count; i++) {
      backUvAttr.setX(i, 1.0 - backUvAttr.getX(i));
    }
    backUvAttr.needsUpdate = true;

    const turningBackMat = new THREE.MeshBasicMaterial({
      map: chapterTextures[2], // Chapter 3
      side: THREE.BackSide,
      depthTest: true,
      depthWrite: true,
    });
    const turningBackMesh = new THREE.Mesh(turningBackGeo, turningBackMat);
    turningBackMesh.position.set(0, 0, BOOK_DEPTH / 2 + 0.006);
    turningBackMesh.renderOrder = 30;
    bookGroup.add(turningBackMesh);

    // Glowing Neon Edge on flipping page outer border
    const turningEdgeGeo = new THREE.BufferGeometry();
    const turningEdgePos = new Float32Array((TURN_SEGS_Y + 1) * 3);
    turningEdgeGeo.setAttribute('position', new THREE.BufferAttribute(turningEdgePos, 3));
    const turningEdgeMat = new THREE.LineBasicMaterial({
      color: COLOR_NEON_RED,
      linewidth: 3,
      depthTest: true,
    });
    const turningEdgeLine = new THREE.Line(turningEdgeGeo, turningEdgeMat);
    turningEdgeLine.renderOrder = 31;
    bookGroup.add(turningEdgeLine);

    // --- 7. Orbiting 3D Neural Nodes ---
    const nodeCount = 30;
    const nodePositions: THREE.Vector3[] = [];
    const nodeGroup = new THREE.Group();
    bookGroup.add(nodeGroup);

    const nodeGeo = new THREE.SphereGeometry(0.04, 12, 12);
    const nodeRedMat = new THREE.MeshBasicMaterial({ color: COLOR_NEON_RED });
    const nodeWhiteMat = new THREE.MeshBasicMaterial({ color: COLOR_WHITE });

    for (let i = 0; i < nodeCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / nodeCount);
      const theta = Math.sqrt(nodeCount * Math.PI) * phi;
      const radius = 2.1 + Math.sin(i * 1.6) * 0.5;

      const pos = new THREE.Vector3(
        radius * Math.sin(phi) * Math.cos(theta) * 1.25,
        radius * Math.cos(phi) * 0.85,
        radius * Math.sin(phi) * Math.sin(theta) * 1.05
      );
      nodePositions.push(pos);

      const sphere = new THREE.Mesh(nodeGeo, i % 3 === 0 ? nodeRedMat : nodeWhiteMat);
      sphere.position.copy(pos);
      nodeGroup.add(sphere);
    }

    const neuralLineVertices: number[] = [];
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        if (nodePositions[i].distanceTo(nodePositions[j]) < 1.5) {
          neuralLineVertices.push(
            nodePositions[i].x,
            nodePositions[i].y,
            nodePositions[i].z,
            nodePositions[j].x,
            nodePositions[j].y,
            nodePositions[j].z
          );
        }
      }
    }

    const neuralLinesGeo = new THREE.BufferGeometry();
    neuralLinesGeo.setAttribute('position', new THREE.Float32BufferAttribute(neuralLineVertices, 3));
    const neuralLinesMat = new THREE.LineBasicMaterial({
      color: COLOR_NEON_RED,
      transparent: true,
      opacity: 0.35,
    });
    const neuralLines = new THREE.LineSegments(neuralLinesGeo, neuralLinesMat);
    bookGroup.add(neuralLines);

    // --- 8. Lights ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.2);
    dirLight1.position.set(3, 5, 6);
    scene.add(dirLight1);

    const redRimLight = new THREE.DirectionalLight(COLOR_NEON_RED, 3.2);
    redRimLight.position.set(-5, -2, -3);
    scene.add(redRimLight);

    // --- 9. Interaction Variables ---
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const onMouseMove = (e: MouseEvent) => {
      targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
      targetMouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        targetMouseX = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
        targetMouseY = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
      }
    };
    window.addEventListener('touchmove', onTouchMove, { passive: true });

    const onResize = () => {
      const w = getWidth();
      const h = getHeight();
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
    let resizeObs: ResizeObserver | null = null;
    if (embedded && typeof ResizeObserver !== 'undefined') {
      resizeObs = new ResizeObserver(onResize);
      resizeObs.observe(container);
    }

    // --- 10. Animation Loop ---
    let animationFrameId: number;
    let pageFlipProgress = 0;
    const PAGE_FLIP_SPEED = embedded ? 0.011 : 0.0072;
    let pauseTimer = 0;
    let currentCycle = 0; // cycles between 0 and 1
    let prevZigzagX = 0;

    const timer = new THREE.Timer();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      timer.update();
      const elapsedTime = timer.getElapsed();

      // Smooth mouse lerp
      mouseX += (targetMouseX - mouseX) * 0.06;
      mouseY += (targetMouseY - mouseY) * 0.06;

      // Advance Page Flip (Right-to-Left)
      if (pauseTimer > 0) {
        pauseTimer -= 0.016;
      } else {
        pageFlipProgress += PAGE_FLIP_SPEED;
        if (pageFlipProgress >= 1.0) {
          pageFlipProgress = 0;
          pauseTimer = 0.9; // Natural pause between page turns

          // Cycle to next spread:
          currentCycle = (currentCycle + 1) % 2;

          if (currentCycle === 0) {
            // Spread A: Left shows Chapter 1, Right shows Chapter 2 (turning page ready with Ch 2 -> Ch 3)
            (leftBlockMat[4] as THREE.MeshBasicMaterial).map = chapterTextures[0];
            leftBlockMat[4].needsUpdate = true;

            (rightBlockMat[4] as THREE.MeshBasicMaterial).map = chapterTextures[3];
            rightBlockMat[4].needsUpdate = true;

            turningFrontMat.map = chapterTextures[1];
            turningFrontMat.needsUpdate = true;

            turningBackMat.map = chapterTextures[2];
            turningBackMat.needsUpdate = true;
          } else {
            // Spread B: Left shows Chapter 3, Right shows Chapter 4 (turning page ready with Ch 4 -> Ch 1)
            (leftBlockMat[4] as THREE.MeshBasicMaterial).map = chapterTextures[2];
            leftBlockMat[4].needsUpdate = true;

            (rightBlockMat[4] as THREE.MeshBasicMaterial).map = chapterTextures[1];
            rightBlockMat[4].needsUpdate = true;

            turningFrontMat.map = chapterTextures[3];
            turningFrontMat.needsUpdate = true;

            turningBackMat.map = chapterTextures[0];
            turningBackMat.needsUpdate = true;
          }
        }
      }

      // Compute Organic Turning Page Deformation from Right (+X) to Left (-X)
      const u = pageFlipProgress;

      // Realistic angle: starts flat on right stack (-OPEN_ANGLE), turns across spine to (+PI + OPEN_ANGLE) on left stack
      const totalRotationAngle = Math.PI + 2 * OPEN_ANGLE;
      const angle = -OPEN_ANGLE + u * totalRotationAngle;

      // Curl factor: lifts from outer free edge (x = PAGE_W) and curves forward into camera (+Z)
      const curlIntensity = Math.sin(u * Math.PI) * 0.85;

      const frontPos = turningFrontGeo.attributes.position;
      const backPos = turningBackGeo.attributes.position;
      const basePos = basePositions;
      const edgePositions: THREE.Vector3[] = [];

      for (let i = 0; i < frontPos.count; i++) {
        const bx = basePos.getX(i); // x in [0, PAGE_W]
        const by = basePos.getY(i);
        const bz = basePos.getZ(i);

        // Distance from spine: normX in [0, 1]
        const normX = Math.max(0, Math.min(1, bx / PAGE_W));

        // Spine anchor weight: strictly 0.0 at the spine hinge (normX = 0), rising smoothly to 1.0 at outer edge.
        // This ensures the sheet stays tightly bound to the spine with zero lift/detachment.
        const spineWeight = Math.sin(normX * Math.PI * 0.5);

        // Wave curl along width - zero at spine, peaks mid-sheet
        const curlZ = Math.sin(normX * Math.PI) * curlIntensity * 0.40;

        // Micro-lift in Y - zero at spine so page doesn't slide along the hinge
        const liftY = Math.sin(normX * Math.PI * 0.5) * curlIntensity * 0.05;

        const localX = bx;
        const localZ = bz + curlZ;

        // Rotate around spine Y axis by +angle:
        // When angle = 0: x' = bx, z' = 0 (right stack)
        // When angle = PI: x' = -bx, z' = 0 (left stack)
        // For angle in (0, PI): z' is positive (+Z), lifting toward the viewer!
        const rotatedX = localX * Math.cos(angle) - localZ * Math.sin(angle);
        const rotatedZ = localX * Math.sin(angle) + localZ * Math.cos(angle);

        // Forward arch into viewer space (+Z) scaled by spineWeight:
        // Strictly 0 at the spine (bx = 0) so the page remains firmly attached to the book spine with thickness,
        // while billowing forward into dramatic 3D space as normX approaches 1.
        const forwardArchZ = Math.sin(u * Math.PI) * 0.52 * spineWeight;

        // Landing damping micro-vibration as sheet lands on left stack (u > 0.9), also zero at spine
        let landOsc = 0;
        if (u > 0.9) {
          const tLand = (u - 0.9) / 0.1;
          landOsc = Math.sin(tLand * Math.PI * 6) * (1 - tLand) * 0.02 * spineWeight;
        }

        const finalZ = rotatedZ + forwardArchZ + landOsc;

        // Assign to both front and back meshes
        frontPos.setXYZ(i, rotatedX, by + liftY, finalZ);
        backPos.setXYZ(i, rotatedX, by + liftY, finalZ - 0.001); // minute offset to prevent z-fighting

        // Track outer edge vertices for neon border highlight (bx ≈ PAGE_W)
        if (Math.abs(bx - PAGE_W) < 0.01) {
          edgePositions.push(new THREE.Vector3(rotatedX, by + liftY, finalZ));
        }
      }

      frontPos.needsUpdate = true;
      backPos.needsUpdate = true;
      turningFrontGeo.computeVertexNormals();
      turningBackGeo.computeVertexNormals();

      // Update neon glowing outer edge of turning page
      const edgeAttr = turningEdgeGeo.attributes.position;
      if (edgeAttr && edgePositions.length > 0) {
        for (let j = 0; j < edgePositions.length; j++) {
          edgeAttr.setXYZ(j, edgePositions[j].x, edgePositions[j].y, edgePositions[j].z);
        }
        edgeAttr.needsUpdate = true;
      }

      if (embedded) {
        rootTrajectoryGroup.position.set(0, -0.05, 0);
        bookGroup.rotation.y = Math.sin(elapsedTime * 0.65) * 0.18 + mouseX * 0.16;
        bookGroup.rotation.x = -0.34 - mouseY * 0.12;
        bookGroup.rotation.z = -0.03 + mouseX * 0.06;
        bookGroup.position.y = Math.sin(elapsedTime * 1.4) * 0.05;
        const w = getWidth();
        const masterScale = w < 360 ? 0.68 : 0.88;
        rootTrajectoryGroup.scale.set(masterScale, masterScale, masterScale);
      } else {
        // Scroll Reactivity: Zigzag trajectory through manga panel gaps
        const scrollY = window.scrollY || 0;
        const docHeight = Math.max(document.body.scrollHeight - window.innerHeight, 1);
        const scrollFraction = Math.min(Math.max(scrollY / docHeight, 0), 1);

        const isMobile = window.innerWidth < 768;
        const zigzagAmp = isMobile ? 0.65 : 1.5;
        const zigzagX = Math.sin(scrollFraction * Math.PI * 3.4) * zigzagAmp;
        const zigzagY = -scrollFraction * 2.0 + Math.cos(scrollFraction * Math.PI * 2) * 0.25;

        rootTrajectoryGroup.position.x = zigzagX;
        rootTrajectoryGroup.position.y = zigzagY;

        // Trajectory banking & cursor rotation:
        // Book looks toward mouse and banks gracefully into its zigzag turns
        const trajectoryDeltaX = zigzagX - prevZigzagX;
        prevZigzagX = zigzagX;

        bookGroup.rotation.y = mouseX * 0.42 + trajectoryDeltaX * 0.25;
        bookGroup.rotation.x = -0.36 - mouseY * 0.28;
        bookGroup.rotation.z = -0.04 + mouseX * 0.12 + trajectoryDeltaX * 0.35;
        bookGroup.position.y = Math.sin(elapsedTime * 1.3) * 0.06;

        // Compact Scale
        const masterScale = isMobile ? 0.38 : 0.68;
        rootTrajectoryGroup.scale.set(masterScale, masterScale, masterScale);

        // Smooth Fade Out before Secondary CTA and Footer:
        const ctaEl = document.getElementById('secondary-cta-section');
        if (ctaEl) {
          const ctaRect = ctaEl.getBoundingClientRect();
          const winH = window.innerHeight || 800;
          if (ctaRect.top < winH * 1.1) {
            const fadeProgress = Math.max(0, Math.min(1, (ctaRect.top - winH * 0.2) / (winH * 0.8)));
            container.style.opacity = `${fadeProgress}`;
          } else {
            container.style.opacity = '1';
          }
        }
      }

      // Neural Pulse
      const pulseWave = Math.sin(elapsedTime * 3.2 + u * Math.PI * 2);
      neuralLinesMat.opacity = 0.2 + Math.max(0, pulseWave) * 0.45;
      nodeGroup.rotation.y = elapsedTime * 0.07;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('resize', onResize);
      resizeObs?.disconnect();

      try {
        if (container && container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        } else {
          renderer.domElement?.remove();
        }
      } catch {
        renderer.domElement?.remove();
      }

      renderer.dispose();
      coverGeo.dispose();
      spineGeo.dispose();
      pageBlockGeo.dispose();
      turningFrontGeo.dispose();
      turningBackGeo.dispose();
      turningEdgeGeo.dispose();
      nodeGeo.dispose();
      neuralLinesGeo.dispose();
      edgeLinesGeo.dispose();
      ribGeo.dispose();

      chapterTextures.forEach((t) => t.dispose());
      coverMat.dispose();
      coverEdgeMat.dispose();
      spineMat.dispose();
      ribMat.dispose();
      turningFrontMat.dispose();
      turningBackMat.dispose();
      turningEdgeMat.dispose();
      nodeRedMat.dispose();
      nodeWhiteMat.dispose();
      neuralLinesMat.dispose();
      edgeLinesMat.dispose();
    };
  }, [embedded]);

  if (embedded) {
    return (
      <div
        aria-hidden="true"
        className={`relative w-full h-full pointer-events-none select-none overflow-hidden ${className}`}
      >
        <div ref={mountRef} className="w-full h-full" />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 pointer-events-none z-10 overflow-hidden w-full h-full select-none transition-opacity duration-300 ${className}`}
    >
      <div ref={mountRef} className="w-full h-full" />
    </div>
  );
};
