import './style.css';
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Configuração Base
let camera, scene, renderer, controls;
let muzzleFlashLight;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = false;

// Sistema de Colisão
let collidableBoxes = [];

// Sistema de Inimigos
let enemies = [];
let enemyBaseModel = null;
const enemySkins = { A: null, C: null };
const ENEMY_COUNT = 10;
const ENEMY_SCALE = 0.027;
const ENEMY_SPEED = 5.0;
const shootRaycaster = new THREE.Raycaster();

// Estado do Jogo e Armas
let currentWeapon = 1;
let currentLevel = 1;
const levels = { 1: "Totentanz (Boate)", 2: "Depósito da Maelstrom", 3: "Docas de Watson" };

// Estado do Jogador
let playerHP = 100;
let lastDamageTime = 0;

// Configuração de cada arma
const weaponsConfig = {
    1: {
        name: "Revólver Overture", cadenceLabel: "Cadência Média", fireRate: 420,
        recoilZ: 0.18, recoilDuration: 120, flashDuration: 60, modelFile: 'revolver.glb',
        defaultPos: { x: 0.26, y: -0.24, z: -0.5 }, scale: 1.1, rotationY: 0
    },
    2: {
        name: "Submetralhadora Pulsar", cadenceLabel: "Cadência Rápida", fireRate: 110,
        recoilZ: 0.08, recoilDuration: 55, flashDuration: 40, modelFile: 'smg.glb',
        defaultPos: { x: 0.28, y: -0.25, z: -0.55 }, scale: 1.1, rotationY: 0
    },
    3: {
        name: "Shotgun", cadenceLabel: "Cadência Lenta", fireRate: 950,
        recoilZ: 0.28, recoilDuration: 250, flashDuration: 90, modelFile: 'shotgun.glb',
        defaultPos: { x: 0.28, y: -0.25, z: -0.55 }, scale: 1.1, rotationY: 0
    }
};

const weaponDamage = { 1: 50, 2: 20, 3: 100 };
let isMouseDown = false;
let lastShotTime = 0;

// Sistema de áudio procedural (Web Audio API)
let audioCtx = null;
function initAudio() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function playGunshotSound(weaponId) {
    if (!audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const bufferDuration = weaponId === 3 ? 0.35 : (weaponId === 1 ? 0.22 : 0.12);
        const bufferSize = Math.floor(audioCtx.sampleRate * bufferDuration);
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;
        const filter = audioCtx.createBiquadFilter();
        const gain = audioCtx.createGain();
        const osc = audioCtx.createOscillator();
        const oscGain = audioCtx.createGain();

        if (weaponId === 1) {
            filter.type = 'bandpass'; filter.frequency.setValueAtTime(1400, now); filter.Q.setValueAtTime(2.0, now);
            gain.gain.setValueAtTime(0.45, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
            osc.type = 'triangle'; osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
            oscGain.gain.setValueAtTime(0.5, now); oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        } else if (weaponId === 2) {
            filter.type = 'highpass'; filter.frequency.setValueAtTime(900, now);
            gain.gain.setValueAtTime(0.28, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(260, now); osc.frequency.exponentialRampToValueAtTime(70, now + 0.07);
            oscGain.gain.setValueAtTime(0.25, now); oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        } else {
            filter.type = 'lowpass'; filter.frequency.setValueAtTime(600, now);
            gain.gain.setValueAtTime(0.7, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.type = 'square'; osc.frequency.setValueAtTime(110, now); osc.frequency.exponentialRampToValueAtTime(25, now + 0.28);
            oscGain.gain.setValueAtTime(0.6, now); oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        }

        noise.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
        osc.connect(oscGain); oscGain.connect(audioCtx.destination);
        noise.start(now); osc.start(now); osc.stop(now + bufferDuration);
    } catch (e) { }
}

const weaponModels = { 1: null, 2: null, 3: null };

// Shaders do Ambiente
const shaderUniforms = {
    time: { value: 1.0 },
    color1: { value: new THREE.Color(0xff003c) },
    color2: { value: new THREE.Color(0x111111) }
};
const vertexShader = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const fragmentShader = `uniform float time; uniform vec3 color1; uniform vec3 color2; varying vec2 vUv; void main() { float grid = sin(vUv.y * 50.0 + time * 5.0) * 0.5 + 0.5; float pulse = sin(time * 2.0) * 0.5 + 0.5; vec3 finalColor = mix(color2, color1, grid * pulse); float dist = distance(vUv, vec2(0.5)); finalColor *= smoothstep(0.8, 0.2, dist); gl_FragColor = vec4(finalColor, 1.0); }`;

// Shaders do Sistema de Sangue (GPU)
const bloodSystems = [];
const bloodVertexShader = `
    uniform float uTime;
    attribute vec3 velocity;
    varying float vAlpha;
    void main() {
        vec3 pos = position + velocity * uTime;
        pos.y -= 25.0 * uTime * uTime * 0.5;
        vAlpha = max(0.0, 1.0 - (uTime * 2.0)); 
        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = 15.0 * (10.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
    }
`;
const bloodFragmentShader = `
    varying float vAlpha;
    void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        gl_FragColor = vec4(0.8, 0.0, 0.1, vAlpha);
    }
`;

try {
    init();
    animate();
} catch (error) {
    console.error("Crash detectado:", error);
    alert("Erro ao iniciar o jogo: " + error.message);
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    scene.fog = new THREE.Fog(0x050505, 0, 50);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);
    camera.position.y = 10;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const neonLight = new THREE.PointLight(0xff003c, 1000, 100);
    neonLight.position.set(0, 20, 0);
    scene.add(neonLight);

    controls = new PointerLockControls(camera, document.body);
    scene.add(camera);

    // Luz do Muzzle Flash (Inicia apagada - intensidade 0)
    muzzleFlashLight = new THREE.PointLight(0xffaa00, 0, 40, 1.5);
    // Posição aproximada do cano da arma (frente, direita e um pouco pra baixo)
    muzzleFlashLight.position.set(0.3, -0.2, -1.5);
    camera.add(muzzleFlashLight);

    const blocker = document.getElementById('blocker');
    const hud = document.getElementById('hud');

    blocker.addEventListener('click', () => { initAudio(); controls.lock(); });
    controls.addEventListener('lock', () => { blocker.style.display = 'none'; hud.style.display = 'block'; });
    controls.addEventListener('unlock', () => { isMouseDown = false; blocker.style.display = 'flex'; hud.style.display = 'none'; });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);

    loadWeapons();
    loadEnemyAssets();
    updateWeaponHUD();
    loadLevel(currentLevel);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);
    window.addEventListener('resize', onWindowResize);
}

function loadWeapons() {
    const gltfLoader = new GLTFLoader();
    Object.entries(weaponsConfig).forEach(([idStr, cfg]) => {
        const id = parseInt(idStr);
        gltfLoader.load(`/${cfg.modelFile}`, (gltf) => {
            const model = gltf.scene;
            model.position.set(cfg.defaultPos.x, cfg.defaultPos.y, cfg.defaultPos.z);
            model.scale.set(cfg.scale, cfg.scale, cfg.scale);
            model.rotation.y = cfg.rotationY;
            camera.add(model);
            weaponModels[id] = model;
            model.visible = (currentWeapon === id);
        });
    });
}

function loadLevel(levelId) {
    const childrenToRemove = scene.children.filter(child => child.type === "Mesh" || (child.type === "Group" && child !== camera));
    childrenToRemove.forEach(child => scene.remove(child));
    collidableBoxes = [];

    document.getElementById('level-info').innerText = `Fase ${levelId}: ${levels[levelId]}`;

    const customMaterial = new THREE.ShaderMaterial({ uniforms: shaderUniforms, vertexShader: vertexShader, fragmentShader: fragmentShader, side: THREE.DoubleSide });
    const floorMaterial = new THREE.MeshPhongMaterial({ color: 0x333333, specular: 0x888888, shininess: 30 });
    const floorGeo = new THREE.PlaneGeometry(200, 200, 10, 10);
    floorGeo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(floorGeo, floorMaterial);
    scene.add(floor);

    const boxGeo = new THREE.BoxGeometry(20, 40, 20);
    const centralBox = new THREE.Mesh(boxGeo, customMaterial);
    centralBox.position.set(0, 20, -30);
    scene.add(centralBox);
    collidableBoxes.push(new THREE.Box3().setFromObject(centralBox));

    const numBoxes = levelId === 1 ? 20 : (levelId === 2 ? 40 : 15);
    const generatedPositions = [];

    for (let i = 0; i < numBoxes; i++) {
        let x, z; let validPosition = false; let attempts = 0;
        while (!validPosition && attempts < 50) {
            x = Math.floor(Math.random() * 20 - 10) * 10; z = Math.floor(Math.random() * 20 - 10) * 10;
            validPosition = true;
            if ((Math.abs(x) <= 20 && Math.abs(z) <= 20) || (Math.abs(x) <= 10 && Math.abs(z + 30) <= 10)) {
                validPosition = false;
            } else {
                for (let pos of generatedPositions) {
                    if (Math.sqrt((x - pos.x) ** 2 + (z - pos.z) ** 2) < 25) { validPosition = false; break; }
                }
            }
            attempts++;
        }
        if (validPosition) {
            generatedPositions.push({ x, z });
            const box = new THREE.Mesh(boxGeo, customMaterial);
            box.position.set(x, 20, z);
            scene.add(box);
            collidableBoxes.push(new THREE.Box3().setFromObject(box));
        }
    }
    spawnEnemies();
}

function loadEnemyAssets() {
    const textureLoader = new THREE.TextureLoader();
    const fbxLoader = new FBXLoader();

    enemySkins.A = textureLoader.load('/Textures/zombieA.png');
    enemySkins.C = textureLoader.load('/Textures/zombieC.png');

    [enemySkins.A, enemySkins.C].forEach(tex => {
        tex.flipY = true; // Corrigido para modelos FBX
        tex.colorSpace = THREE.SRGBColorSpace;
    });

    fbxLoader.load('/characterMedium.fbx', (fbx) => {
        enemyBaseModel = fbx;
        if (scene && enemies.length === 0) spawnEnemies();
    });
}

function spawnEnemies() {
    if (!enemyBaseModel) return;

    enemies.forEach(e => { if (e.group && e.group.parent) e.group.parent.remove(e.group); });
    enemies = [];
    const spawnedPositions = [];

    for (let i = 0; i < ENEMY_COUNT; i++) {
        let x, z; let validPos = false; let attempts = 0;
        while (!validPos && attempts < 100) {
            x = (Math.random() - 0.5) * 160; z = (Math.random() - 0.5) * 160;
            validPos = true;
            if (Math.abs(x) < 15 && Math.abs(z) < 15) validPos = false;
            if (validPos) {
                const testBox = new THREE.Box3(); testBox.min.set(x - 3, 0, z - 3); testBox.max.set(x + 3, 10, z + 3);
                for (const box of collidableBoxes) { if (testBox.intersectsBox(box)) { validPos = false; break; } }
            }
            if (validPos) {
                for (const pos of spawnedPositions) {
                    if (Math.sqrt((x - pos.x) ** 2 + (z - pos.z) ** 2) < 20) { validPos = false; break; }
                }
            }
            attempts++;
        }
        if (!validPos) { x = (i - 5) * 15; z = -40 - Math.random() * 30; }
        spawnedPositions.push({ x, z });

        const clone = SkeletonUtils.clone(enemyBaseModel);
        const skinChoice = Math.random() < 0.5 ? 'A' : 'C';
        const skinTexture = enemySkins[skinChoice];

        clone.traverse(child => {
            if (child.isSkinnedMesh) {
                const mat = new THREE.MeshPhongMaterial({ map: skinTexture, specular: new THREE.Color(0x222222), shininess: 5 });

                mat.userData = { hitMix: { value: 0.0 } };
                mat.onBeforeCompile = (shader) => {
                    shader.uniforms.hitMix = mat.userData.hitMix;
                    shader.fragmentShader = `uniform float hitMix;\n` + shader.fragmentShader;
                    shader.fragmentShader = shader.fragmentShader.replace(
                        `#include <dithering_fragment>`,
                        `#include <dithering_fragment>\n gl_FragColor = mix(gl_FragColor, vec4(1.0, 0.0, 0.0, 1.0), hitMix);`
                    );
                };

                child.material = mat;
                child.castShadow = true;
                child.frustumCulled = false;
            }
        });

        clone.scale.set(ENEMY_SCALE, ENEMY_SCALE, ENEMY_SCALE);
        const group = new THREE.Group();
        group.add(clone); group.position.set(x, 0, z);
        scene.add(group);

        const initialBoneRotations = {};
        clone.traverse(child => { if (child.isBone) initialBoneRotations[child.name] = child.rotation.clone(); });

        enemies.push({
            group: group, model: clone, hp: 100, alive: true, dying: false, deathTimer: 0,
            timeOffset: Math.random() * Math.PI * 2, initialBoneRotations: initialBoneRotations, hitFlashTimer: 0
        });
    }
    updateEnemyHUD();
}

function updateEnemyHUD() {
    const el = document.getElementById('enemy-info');
    if (el) el.innerHTML = `Inimigos: ${enemies.filter(e => e.alive && !e.dying).length} / ${ENEMY_COUNT}`;
}

function spawnBlood(hitPoint, hitDirection) {
    const particleCount = 40;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = hitPoint.x; positions[i * 3 + 1] = hitPoint.y; positions[i * 3 + 2] = hitPoint.z;
        velocities[i * 3] = hitDirection.x * 8.0 + (Math.random() - 0.5) * 5.0;
        velocities[i * 3 + 1] = hitDirection.y * 8.0 + Math.random() * 8.0;
        velocities[i * 3 + 2] = hitDirection.z * 8.0 + (Math.random() - 0.5) * 5.0;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));

    const mat = new THREE.ShaderMaterial({ vertexShader: bloodVertexShader, fragmentShader: bloodFragmentShader, uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    bloodSystems.push({ points, time: 0 });
}

function damagePlayer(amount, time) {
    // Cooldown de 1 segundo (frames de invencibilidade)
    if (time - lastDamageTime < 1.0) return;

    playerHP -= amount;
    lastDamageTime = time;

    // Atualiza o HUD (muda a cor para vermelho se o HP estiver baixo)
    const hpEl = document.getElementById('player-hp');
    if (hpEl) {
        hpEl.innerText = `HP: ${playerHP}`;
        if (playerHP <= 30) {
            hpEl.style.color = '#ff0000';
            hpEl.style.textShadow = '0 0 10px #ff0000';
        }
    }

    // Efeito de tela piscando em vermelho
    const damageFlash = document.createElement('div');
    damageFlash.style.position = 'absolute';
    damageFlash.style.top = '0';
    damageFlash.style.left = '0';
    damageFlash.style.width = '100%';
    damageFlash.style.height = '100%';
    damageFlash.style.backgroundColor = 'rgba(255, 0, 0, 0.4)';
    damageFlash.style.pointerEvents = 'none'; // Para não bloquear os cliques
    damageFlash.style.zIndex = '1000';
    document.body.appendChild(damageFlash);

    setTimeout(() => {
        if (document.body.contains(damageFlash)) {
            document.body.removeChild(damageFlash);
        }
    }, 200);

    // Verifica Morte
    if (playerHP <= 0) {
        // Solta o mouse e exibe a tela de morte/restart
        controls.unlock();
        const blocker = document.getElementById('blocker');
        blocker.innerHTML = `<h1 style="font-size: 64px; text-shadow: 0 0 20px #ff0000; color: #ff0000;">VOCÊ MORREU</h1><p style="color: white;">Clique para reiniciar a fase</p>`;
        blocker.style.backgroundColor = 'rgba(20, 0, 0, 0.9)';

        // Reseta a vida para o próximo clique
        playerHP = 100;
        hpEl.innerText = `HP: 100`;
        hpEl.style.color = '#00ff44';
        hpEl.style.textShadow = '0 0 10px #00ff44';

        loadLevel(currentLevel); // Reinicia a fase atual
    }
}

function damageEnemy(enemy, damage) {
    if (!enemy.alive || enemy.dying) return;
    enemy.hp -= damage;
    enemy.hitFlashTimer = 0.15;

    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        crosshair.classList.add('hit');
        setTimeout(() => crosshair.classList.remove('hit'), 100);
    }

    if (enemy.hp <= 0) {
        enemy.dying = true; enemy.deathTimer = 0;
        updateEnemyHUD();
    }
}

function animateEnemyBones(enemy, time) {
    if (!enemy.alive || enemy.dying) return;
    const walkSpeed = 6.0; const t = time + enemy.timeOffset; const init = enemy.initialBoneRotations;

    const leftUpLeg = enemy.model.getObjectByName('LeftUpLeg'); const rightUpLeg = enemy.model.getObjectByName('RightUpLeg');
    const leftLeg = enemy.model.getObjectByName('LeftLeg'); const rightLeg = enemy.model.getObjectByName('RightLeg');
    if (leftUpLeg && init['LeftUpLeg']) leftUpLeg.rotation.x = init['LeftUpLeg'].x + Math.sin(t * walkSpeed) * 0.35;
    if (rightUpLeg && init['RightUpLeg']) rightUpLeg.rotation.x = init['RightUpLeg'].x + Math.sin(t * walkSpeed + Math.PI) * 0.35;
    if (leftLeg && init['LeftLeg']) leftLeg.rotation.x = init['LeftLeg'].x + Math.max(0, Math.sin(t * walkSpeed + 0.5)) * 0.4;
    if (rightLeg && init['RightLeg']) rightLeg.rotation.x = init['RightLeg'].x + Math.max(0, Math.sin(t * walkSpeed + Math.PI + 0.5)) * 0.4;

    const hips = enemy.model.getObjectByName('Hips');
    if (hips && init['Hips']) hips.rotation.z = init['Hips'].z + Math.sin(t * walkSpeed) * 0.04;

    const spine = enemy.model.getObjectByName('Spine');
    if (spine && init['Spine']) spine.rotation.x = init['Spine'].x + 0.15;

    const leftArm = enemy.model.getObjectByName('LeftArm'); const rightArm = enemy.model.getObjectByName('RightArm');
    const leftForeArm = enemy.model.getObjectByName('LeftForeArm'); const rightForeArm = enemy.model.getObjectByName('RightForeArm');
    if (leftArm && init['LeftArm']) { leftArm.rotation.x = init['LeftArm'].x + 0.5 + Math.sin(t * 2.5) * 0.08; leftArm.rotation.z = init['LeftArm'].z - 0.3; }
    if (rightArm && init['RightArm']) { rightArm.rotation.x = init['RightArm'].x - 0.5 + Math.sin(t * 2.5 + 0.5) * 0.08; rightArm.rotation.z = init['RightArm'].z + 0.3; }
    if (leftForeArm && init['LeftForeArm']) leftForeArm.rotation.x = init['LeftForeArm'].x + 0.3;
    if (rightForeArm && init['RightForeArm']) rightForeArm.rotation.x = init['RightForeArm'].x + 0.3;

    const head = enemy.model.getObjectByName('Head');
    if (head && init['Head']) { head.rotation.z = init['Head'].z + Math.sin(t * 1.8) * 0.12; head.rotation.x = init['Head'].x + 0.1; }
}

function updateEnemies(delta, time) {
    const playerPos = camera.position.clone(); playerPos.y = 0;

    for (const enemy of enemies) {
        if (!enemy.alive) continue;

        if (enemy.dying) {
            enemy.deathTimer += delta;
            enemy.model.rotation.x = (-Math.PI / 2) * Math.min(1 - Math.pow(1 - Math.min(enemy.deathTimer / 0.6, 1.0), 3), 1.0);
            if (enemy.deathTimer > 2.5) { enemy.alive = false; if (enemy.group.parent) enemy.group.parent.remove(enemy.group); }
            continue;
        }

        if (enemy.hitFlashTimer > 0) {
            enemy.hitFlashTimer -= delta;
            const flashIntensity = enemy.hitFlashTimer > 0 ? (enemy.hitFlashTimer / 0.15) * 0.8 : 0.0;
            enemy.model.traverse(child => { if (child.isSkinnedMesh && child.material.userData.hitMix) child.material.userData.hitMix.value = flashIntensity; });
        }

        const enemyPos = enemy.group.position.clone(); enemyPos.y = 0;
        const dirToPlayer = new THREE.Vector3().subVectors(playerPos, enemyPos);
        const distToPlayer = dirToPlayer.length();

        // Se o inimigo encostar no jogador (distância menor que 3 unidades)
        if (distToPlayer < 3.0 && !enemy.dying) {
            damagePlayer(10, time); // Arranca 10 de HP
        }

        if (distToPlayer > 3) {
            dirToPlayer.normalize();
            const moveX = dirToPlayer.x * ENEMY_SPEED * delta; const moveZ = dirToPlayer.z * ENEMY_SPEED * delta;
            const newPos = enemy.group.position.clone(); newPos.x += moveX; newPos.z += moveZ;

            const enemyBox = new THREE.Box3(); enemyBox.min.set(newPos.x - 1.5, 0, newPos.z - 1.5); enemyBox.max.set(newPos.x + 1.5, 10, newPos.z + 1.5);
            let blocked = false;
            for (const box of collidableBoxes) { if (enemyBox.intersectsBox(box)) { blocked = true; break; } }
            if (!blocked) { enemy.group.position.x += moveX; enemy.group.position.z += moveZ; }
            enemy.group.rotation.y = Math.atan2(dirToPlayer.x, dirToPlayer.z);
        }
        animateEnemyBones(enemy, time);
    }
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break; case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break; case 'KeyD': moveRight = true; break;
        case 'Space': if (canJump) velocity.y += 150; canJump = false; break;
        case 'Digit1': switchWeapon(1); break; case 'Digit2': switchWeapon(2); break; case 'Digit3': switchWeapon(3); break;
        case 'KeyL': currentLevel = currentLevel === 3 ? 1 : currentLevel + 1; loadLevel(currentLevel); break;
    }
}
function onKeyUp(event) {
    switch (event.code) { case 'KeyW': moveForward = false; break; case 'KeyA': moveLeft = false; break; case 'KeyS': moveBackward = false; break; case 'KeyD': moveRight = false; break; }
}

function updateWeaponHUD() {
    const config = weaponsConfig[currentWeapon];
    const weaponInfoEl = document.getElementById('weapon-info');
    if (weaponInfoEl && config) weaponInfoEl.innerHTML = `Arma: ${config.name} <br><span style="font-size: 14px; color: #ff003c; text-shadow: 0 0 5px #ff003c;">${config.cadenceLabel}</span>`;
}

function switchWeapon(id) {
    if (!weaponsConfig[id]) return;
    currentWeapon = id; updateWeaponHUD();
    for (let wId in weaponModels) {
        const model = weaponModels[wId]; const cfg = weaponsConfig[wId];
        if (model && cfg) {
            if (model._recoilTimer) clearTimeout(model._recoilTimer);
            model.position.set(cfg.defaultPos.x, cfg.defaultPos.y, cfg.defaultPos.z);
            model.visible = (parseInt(wId) === currentWeapon);
        }
    }
}

function onMouseDown(event) { if (event.button !== 0) return; initAudio(); if (!controls.isLocked) return; isMouseDown = true; tryShoot(); }
function onMouseUp(event) { if (event.button === 0) isMouseDown = false; }

function tryShoot() {
    if (!controls.isLocked) return;
    const now = performance.now(); const config = weaponsConfig[currentWeapon];
    if (!config || now - lastShotTime < config.fireRate) return;
    lastShotTime = now; executeShot(config);
}

function executeShot(config) {
    const currentModel = weaponModels[currentWeapon];
    if (currentModel) {
        if (currentModel._recoilTimer) clearTimeout(currentModel._recoilTimer);
        currentModel.position.z = config.defaultPos.z + config.recoilZ;
        currentModel._recoilTimer = setTimeout(() => { currentModel.position.z = config.defaultPos.z; }, config.recoilDuration);
    }

    // Define cor e intensidade baseadas na arma
    if (currentWeapon === 3) { // Shotgun
        muzzleFlashLight.color.setHex(0xff8800); // Fogo alaranjado forte
        muzzleFlashLight.intensity = 3000;
    } else if (currentWeapon === 2) { // SMG
        muzzleFlashLight.color.setHex(0x00ffff); // Disparo Cyberpunk azul ciano
        muzzleFlashLight.intensity = 1500;
    } else { // Revólver
        muzzleFlashLight.color.setHex(0xffdd88); // Disparo padrão amarelado
        muzzleFlashLight.intensity = 2000;
    }

    // Desliga a luz após a duração do flash
    muzzleFlashLight._timeout = setTimeout(() => {
        muzzleFlashLight.intensity = 0;
    }, config.flashDuration);

    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        crosshair.style.transform = 'translate(-50%, -50%) scale(1.35)';
        setTimeout(() => { crosshair.style.transform = 'translate(-50%, -50%) scale(1)'; }, 60);
    }

    playGunshotSound(currentWeapon);
    shootRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const enemyMeshes = [];
    enemies.forEach(enemy => {
        if (!enemy.alive || enemy.dying) return;
        enemy.model.traverse(child => { if (child.isSkinnedMesh) enemyMeshes.push({ mesh: child, enemy: enemy }); });
    });

    const hits = shootRaycaster.intersectObjects(enemyMeshes.map(e => e.mesh), false);
    if (hits.length > 0) {
        const hit = hits[0];
        const hitEnemy = enemyMeshes.find(e => e.mesh === hit.object);
        if (hitEnemy) {
            damageEnemy(hitEnemy.enemy, weaponDamage[currentWeapon] || 34);
            const hitDirection = new THREE.Vector3().subVectors(camera.position, hit.point).normalize();
            spawnBlood(hit.point, hitDirection);
        }
    }
}

function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }

function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    shaderUniforms.time.value += delta;

    for (let i = bloodSystems.length - 1; i >= 0; i--) {
        const sys = bloodSystems[i];
        sys.time += delta;
        sys.points.material.uniforms.uTime.value = sys.time;
        if (sys.time > 0.5) { scene.remove(sys.points); sys.points.geometry.dispose(); sys.points.material.dispose(); bloodSystems.splice(i, 1); }
    }

    updateEnemies(delta, time / 1000);

    if (controls.isLocked === true) {
        if (isMouseDown) tryShoot();
        velocity.x -= velocity.x * 10.0 * delta; velocity.z -= velocity.z * 10.0 * delta; velocity.y -= 9.8 * 100.0 * delta;
        direction.z = Number(moveForward) - Number(moveBackward); direction.x = Number(moveRight) - Number(moveLeft); direction.normalize();

        const speed = 400.0;
        if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

        const oldX = camera.position.x; const oldZ = camera.position.z;
        controls.moveRight(-velocity.x * delta); controls.moveForward(-velocity.z * delta); camera.position.y += (velocity.y * delta);

        const playerBox = new THREE.Box3(); playerBox.min.set(camera.position.x - 2.5, 0, camera.position.z - 2.5); playerBox.max.set(camera.position.x + 2.5, 20, camera.position.z + 2.5);
        let isColliding = false;
        for (let i = 0; i < collidableBoxes.length; i++) { if (playerBox.intersectsBox(collidableBoxes[i])) { isColliding = true; break; } }
        if (isColliding) { camera.position.x = oldX; camera.position.z = oldZ; velocity.x = 0; velocity.z = 0; }
        if (camera.position.y < 10) { velocity.y = 0; camera.position.y = 10; canJump = true; }
    }

    prevTime = time; renderer.render(scene, camera);
}