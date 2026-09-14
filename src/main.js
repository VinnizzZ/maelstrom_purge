import './style.css';
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Configuração Base
let camera, scene, renderer, controls;
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

// Configuração de cada arma: cadência de tiro, recuo e iluminação
const weaponsConfig = {
    1: {
        name: "Revólver Overture",
        cadenceLabel: "Cadência Média",
        fireRate: 420, // ~2.4 disparos por segundo (Cadência Média)
        recoilZ: 0.18,
        recoilDuration: 120,
        flashDuration: 60,
        modelFile: 'revolver.glb',
        defaultPos: { x: 0.26, y: -0.24, z: -0.5 },
        scale: 1.1,
        rotationY: 0
    },
    2: {
        name: "Submetralhadora Pulsar",
        cadenceLabel: "Cadência Rápida",
        fireRate: 110, // ~9 disparos por segundo (Cadência Rápida)
        recoilZ: 0.08,
        recoilDuration: 55,
        flashDuration: 40,
        modelFile: 'smg.glb',
        defaultPos: { x: 0.28, y: -0.25, z: -0.55 },
        scale: 1.1,
        rotationY: 0
    },
    3: {
        name: "Shotgun",
        cadenceLabel: "Cadência Lenta",
        fireRate: 950, // ~1 disparo por segundo (Cadência Lenta)
        recoilZ: 0.28,
        recoilDuration: 250,
        flashDuration: 90,
        modelFile: 'shotgun.glb',
        defaultPos: { x: 0.28, y: -0.25, z: -0.55 },
        scale: 1.1,
        rotationY: 0
    }
};
const weaponsInfo = {
    1: weaponsConfig[1].name,
    2: weaponsConfig[2].name,
    3: weaponsConfig[3].name
};

// Dano de cada arma
const weaponDamage = {
    1: 50,   // Revólver - 2 tiros para matar
    2: 20,   // SMG - 5 tiros para matar
    3: 100   // Shotgun - 1 tiro para matar
};

// Controle de cadência de disparo
let isMouseDown = false;
let lastShotTime = 0;

// Sistema de áudio procedural (Web Audio API)
let audioCtx = null;
function initAudio() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            audioCtx = new AudioContext();
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playGunshotSound(weaponId) {
    if (!audioCtx) return;
    try {
        const now = audioCtx.currentTime;
        const bufferDuration = weaponId === 3 ? 0.35 : (weaponId === 1 ? 0.22 : 0.12);
        const bufferSize = Math.floor(audioCtx.sampleRate * bufferDuration);
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        const gain = audioCtx.createGain();

        const osc = audioCtx.createOscillator();
        const oscGain = audioCtx.createGain();

        if (weaponId === 1) {
            // Revólver: estalo forte e cadenciado
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1400, now);
            filter.Q.setValueAtTime(2.0, now);

            gain.gain.setValueAtTime(0.45, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.15);
            oscGain.gain.setValueAtTime(0.5, now);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        } else if (weaponId === 2) {
            // SMG: disparo rápido, seco e nítido
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(900, now);

            gain.gain.setValueAtTime(0.28, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(260, now);
            osc.frequency.exponentialRampToValueAtTime(70, now + 0.07);
            oscGain.gain.setValueAtTime(0.25, now);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        } else {
            // Shotgun: estrondo grave e poderoso
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(600, now);

            gain.gain.setValueAtTime(0.7, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

            osc.type = 'square';
            osc.frequency.setValueAtTime(110, now);
            osc.frequency.exponentialRampToValueAtTime(25, now + 0.28);
            oscGain.gain.setValueAtTime(0.6, now);
            oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        }

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        osc.connect(oscGain);
        oscGain.connect(audioCtx.destination);

        noise.start(now);
        osc.start(now);
        osc.stop(now + bufferDuration);
    } catch (e) {
        // Fallback silencioso caso áudio falhe
    }
}

// Dicionário para armazenar as malhas 3D das armas
const weaponModels = {
    1: null,
    2: null,
    3: null
};

// Uniforms para o Shader Customizado
const shaderUniforms = {
    time: { value: 1.0 },
    color1: { value: new THREE.Color(0xff003c) },
    color2: { value: new THREE.Color(0x111111) }
};

const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = `
    uniform float time;
    uniform vec3 color1;
    uniform vec3 color2;
    varying vec2 vUv;
    void main() {
        float grid = sin(vUv.y * 50.0 + time * 5.0) * 0.5 + 0.5;
        float pulse = sin(time * 2.0) * 0.5 + 0.5;
        vec3 finalColor = mix(color2, color1, grid * pulse);
        float dist = distance(vUv, vec2(0.5));
        finalColor *= smoothstep(0.8, 0.2, dist);
        gl_FragColor = vec4(finalColor, 1.0);
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

    const blocker = document.getElementById('blocker');
    const hud = document.getElementById('hud');

    blocker.addEventListener('click', () => {
        initAudio();
        controls.lock();
    });
    controls.addEventListener('lock', () => {
        blocker.style.display = 'none';
        hud.style.display = 'block';
    });
    controls.addEventListener('unlock', () => {
        isMouseDown = false;
        blocker.style.display = 'flex';
        hud.style.display = 'none';
    });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);

    // Carrega os Modelos 3D das armas
    loadWeapons();

    // Carrega o modelo e skins dos inimigos
    loadEnemyAssets();

    // Atualiza HUD da arma inicial
    updateWeaponHUD();

    // Carrega o cenário
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
        }, undefined, (error) => {
            console.warn(`Aviso: Não foi possível carregar ${cfg.modelFile}. O jogo continuará sem o modelo.`);
        });
    });
}

function loadLevel(levelId) {
    const childrenToRemove = scene.children.filter(child => child.type === "Mesh" || (child.type === "Group" && child !== camera));
    childrenToRemove.forEach(child => scene.remove(child));

    collidableBoxes = [];

    document.getElementById('level-info').innerText = `Fase ${levelId}: ${levels[levelId]}`;

    const customMaterial = new THREE.ShaderMaterial({
        uniforms: shaderUniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        side: THREE.DoubleSide
    });

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
    const minDistance = 25;

    for (let i = 0; i < numBoxes; i++) {
        let x, z;
        let validPosition = false;
        let attempts = 0;

        while (!validPosition && attempts < 50) {
            x = Math.floor(Math.random() * 20 - 10) * 10;
            z = Math.floor(Math.random() * 20 - 10) * 10;
            validPosition = true;

            if ((Math.abs(x) <= 20 && Math.abs(z) <= 20) || (Math.abs(x) <= 10 && Math.abs(z + 30) <= 10)) {
                validPosition = false;
            } else {
                for (let pos of generatedPositions) {
                    const dx = x - pos.x;
                    const dz = z - pos.z;
                    if (Math.sqrt(dx * dx + dz * dz) < minDistance) {
                        validPosition = false;
                        break;
                    }
                }
            }
            attempts++;
        }

        if (validPosition) {
            generatedPositions.push({ x, z });
            const box = new THREE.Mesh(boxGeo, customMaterial);
            box.position.set(x, 20, z);
            scene.add(box);

            const bbox = new THREE.Box3().setFromObject(box);
            collidableBoxes.push(bbox);
        }
    }

    // Spawna os inimigos no mapa
    spawnEnemies();
}

// ======= SISTEMA DE INIMIGOS =======

function loadEnemyAssets() {
    const textureLoader = new THREE.TextureLoader();
    const fbxLoader = new FBXLoader();

    // Carrega as texturas das skins
    enemySkins.A = textureLoader.load('/Textures/zombieA.png');
    enemySkins.C = textureLoader.load('/Textures/zombieC.png');

    // Configura as texturas para FBX
    [enemySkins.A, enemySkins.C].forEach(tex => {
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
    });

    // Carrega o modelo FBX base
    fbxLoader.load('/characterMedium.fbx', (fbx) => {
        enemyBaseModel = fbx;
        // Se o level já foi carregado mas os inimigos ainda não foram criados
        if (scene && enemies.length === 0) spawnEnemies();
    }, undefined, (error) => {
        console.warn('Aviso: Não foi possível carregar characterMedium.fbx:', error);
    });
}

function spawnEnemies() {
    if (!enemyBaseModel) return;

    // Remove inimigos anteriores
    enemies.forEach(e => {
        if (e.group && e.group.parent) {
            e.group.parent.remove(e.group);
        }
    });
    enemies = [];

    const spawnedPositions = [];
    const minSpawnDist = 20;

    for (let i = 0; i < ENEMY_COUNT; i++) {
        let x, z;
        let validPos = false;
        let attempts = 0;

        while (!validPos && attempts < 100) {
            x = (Math.random() - 0.5) * 160; // -80 a 80
            z = (Math.random() - 0.5) * 160;
            validPos = true;

            // Evita spawn perto do jogador (centro do mapa)
            if (Math.abs(x) < 15 && Math.abs(z) < 15) {
                validPos = false;
            }

            // Evita spawn dentro de obstáculos
            if (validPos) {
                const testBox = new THREE.Box3();
                testBox.min.set(x - 3, 0, z - 3);
                testBox.max.set(x + 3, 10, z + 3);
                for (const box of collidableBoxes) {
                    if (testBox.intersectsBox(box)) {
                        validPos = false;
                        break;
                    }
                }
            }

            // Evita spawn muito perto de outros inimigos
            if (validPos) {
                for (const pos of spawnedPositions) {
                    const dx = x - pos.x;
                    const dz = z - pos.z;
                    if (Math.sqrt(dx * dx + dz * dz) < minSpawnDist) {
                        validPos = false;
                        break;
                    }
                }
            }

            attempts++;
        }

        // Fallback se não encontrar posição válida
        if (!validPos) {
            x = (i - 5) * 15;
            z = -40 - Math.random() * 30;
        }
        spawnedPositions.push({ x, z });

        // Clona o modelo base com SkeletonUtils para preservar bones
        const clone = SkeletonUtils.clone(enemyBaseModel);

        // Escolhe skin aleatória: zombieA ou zombieC
        const skinChoice = Math.random() < 0.5 ? 'A' : 'C';
        const skinTexture = enemySkins[skinChoice];

        // Aplica a textura ao material da malha
        clone.traverse(child => {
            if (child.isSkinnedMesh) {
                child.material = new THREE.MeshPhongMaterial({
                    map: skinTexture,
                    vertexColors: false,
                    specular: new THREE.Color(0x222222),
                    shininess: 5,
                });
                child.castShadow = true;
                child.frustumCulled = false;
            }
        });

        // Escala para tamanho realista (~10 unidades de altura)
        clone.scale.set(ENEMY_SCALE, ENEMY_SCALE, ENEMY_SCALE);

        // Cria grupo container para posicionamento e rotação
        const group = new THREE.Group();
        group.add(clone);
        group.position.set(x, 0, z);
        scene.add(group);

        // Armazena rotações iniciais dos ossos para animação procedural
        const initialBoneRotations = {};
        clone.traverse(child => {
            if (child.isBone) {
                initialBoneRotations[child.name] = child.rotation.clone();
            }
        });

        // Dados do inimigo
        const enemy = {
            group: group,
            model: clone,
            skin: skinChoice,
            hp: 100,
            alive: true,
            dying: false,
            deathTimer: 0,
            timeOffset: Math.random() * Math.PI * 2,
            initialBoneRotations: initialBoneRotations,
            hitFlashTimer: 0,
            originalMaterials: [],
        };

        // Armazena referências aos materiais originais para restaurar após flash
        clone.traverse(child => {
            if (child.isSkinnedMesh) {
                enemy.originalMaterials.push({
                    mesh: child,
                    material: child.material
                });
            }
        });

        enemies.push(enemy);
    }

    updateEnemyHUD();
}

function updateEnemyHUD() {
    const el = document.getElementById('enemy-info');
    if (el) {
        const alive = enemies.filter(e => e.alive && !e.dying).length;
        el.innerHTML = `Inimigos: ${alive} / ${ENEMY_COUNT}`;
    }
}

function damageEnemy(enemy, damage) {
    if (!enemy.alive || enemy.dying) return;

    enemy.hp -= damage;

    // Efeito de flash vermelho ao ser atingido
    enemy.hitFlashTimer = 0.15;
    const flashMat = new THREE.MeshPhongMaterial({
        color: 0xff0000,
        emissive: 0xff0000,
        emissiveIntensity: 0.8,
    });
    enemy.model.traverse(child => {
        if (child.isSkinnedMesh) {
            child.material = flashMat;
        }
    });

    // Feedback visual na mira
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        crosshair.classList.add('hit');
        setTimeout(() => crosshair.classList.remove('hit'), 100);
    }

    // Verifica morte
    if (enemy.hp <= 0) {
        enemy.dying = true;
        enemy.deathTimer = 0;
        updateEnemyHUD();
    }
}

function animateEnemyBones(enemy, time) {
    if (!enemy.alive || enemy.dying) return;

    const walkSpeed = 6.0;
    const t = time + enemy.timeOffset;
    const init = enemy.initialBoneRotations;

    // Pernas - ciclo de caminhada com offset individual
    const leftUpLeg = enemy.model.getObjectByName('LeftUpLeg');
    const rightUpLeg = enemy.model.getObjectByName('RightUpLeg');
    const leftLeg = enemy.model.getObjectByName('LeftLeg');
    const rightLeg = enemy.model.getObjectByName('RightLeg');

    if (leftUpLeg && init['LeftUpLeg']) {
        leftUpLeg.rotation.x = init['LeftUpLeg'].x + Math.sin(t * walkSpeed) * 0.35;
    }
    if (rightUpLeg && init['RightUpLeg']) {
        rightUpLeg.rotation.x = init['RightUpLeg'].x + Math.sin(t * walkSpeed + Math.PI) * 0.35;
    }
    if (leftLeg && init['LeftLeg']) {
        const bend = Math.max(0, Math.sin(t * walkSpeed + 0.5)) * 0.4;
        leftLeg.rotation.x = init['LeftLeg'].x + bend;
    }
    if (rightLeg && init['RightLeg']) {
        const bend = Math.max(0, Math.sin(t * walkSpeed + Math.PI + 0.5)) * 0.4;
        rightLeg.rotation.x = init['RightLeg'].x + bend;
    }

    // Quadril - balanço lateral sutil
    const hips = enemy.model.getObjectByName('Hips');
    if (hips && init['Hips']) {
        hips.rotation.z = init['Hips'].z + Math.sin(t * walkSpeed) * 0.04;
    }

    // Coluna - inclinação para frente (postura de zumbi)
    const spine = enemy.model.getObjectByName('Spine');
    if (spine && init['Spine']) {
        spine.rotation.x = init['Spine'].x + 0.15;
    }

    // Braços - estendidos para frente com balanço (pose clássica de zumbi)
    const leftArm = enemy.model.getObjectByName('LeftArm');
    const rightArm = enemy.model.getObjectByName('RightArm');
    const leftForeArm = enemy.model.getObjectByName('LeftForeArm');
    const rightForeArm = enemy.model.getObjectByName('RightForeArm');

    if (leftArm && init['LeftArm']) {
        leftArm.rotation.x = init['LeftArm'].x + 0.5 + Math.sin(t * 2.5) * 0.08;
        leftArm.rotation.z = init['LeftArm'].z - 0.3;
    }
    if (rightArm && init['RightArm']) {
        rightArm.rotation.x = init['RightArm'].x - 0.5 + Math.sin(t * 2.5 + 0.5) * 0.08;
        rightArm.rotation.z = init['RightArm'].z + 0.3;
    }
    if (leftForeArm && init['LeftForeArm']) {
        leftForeArm.rotation.x = init['LeftForeArm'].x + 0.3;
    }
    if (rightForeArm && init['RightForeArm']) {
        rightForeArm.rotation.x = init['RightForeArm'].x + 0.3;
    }

    // Cabeça - oscilação lenta e inclinação
    const head = enemy.model.getObjectByName('Head');
    if (head && init['Head']) {
        head.rotation.z = init['Head'].z + Math.sin(t * 1.8) * 0.12;
        head.rotation.x = init['Head'].x + 0.1;
    }
}

function updateEnemies(delta, time) {
    const playerPos = camera.position.clone();
    playerPos.y = 0;

    for (const enemy of enemies) {
        if (!enemy.alive) continue;

        // Animação de morte: tomba para trás e remove
        if (enemy.dying) {
            enemy.deathTimer += delta;
            const fallProgress = Math.min(enemy.deathTimer / 0.6, 1.0);
            const easeProgress = 1 - Math.pow(1 - fallProgress, 3);
            enemy.model.rotation.x = (-Math.PI / 2) * easeProgress;

            if (enemy.deathTimer > 2.5) {
                enemy.alive = false;
                if (enemy.group.parent) {
                    enemy.group.parent.remove(enemy.group);
                }
            }
            continue;
        }

        // Restaura materiais após flash de dano
        if (enemy.hitFlashTimer > 0) {
            enemy.hitFlashTimer -= delta;
            if (enemy.hitFlashTimer <= 0) {
                enemy.originalMaterials.forEach(({ mesh, material }) => {
                    mesh.material = material;
                });
            }
        }

        // IA: persegue o jogador
        const enemyPos = enemy.group.position.clone();
        enemyPos.y = 0;
        const dirToPlayer = new THREE.Vector3().subVectors(playerPos, enemyPos);
        const distToPlayer = dirToPlayer.length();

        if (distToPlayer > 3) {
            dirToPlayer.normalize();
            const moveX = dirToPlayer.x * ENEMY_SPEED * delta;
            const moveZ = dirToPlayer.z * ENEMY_SPEED * delta;

            // Testa colisão antes de mover
            const newPos = enemy.group.position.clone();
            newPos.x += moveX;
            newPos.z += moveZ;

            const enemyBox = new THREE.Box3();
            enemyBox.min.set(newPos.x - 1.5, 0, newPos.z - 1.5);
            enemyBox.max.set(newPos.x + 1.5, 10, newPos.z + 1.5);

            let blocked = false;
            for (const box of collidableBoxes) {
                if (enemyBox.intersectsBox(box)) {
                    blocked = true;
                    break;
                }
            }

            if (!blocked) {
                enemy.group.position.x += moveX;
                enemy.group.position.z += moveZ;
            }

            // Rotaciona para olhar na direção do jogador
            const angle = Math.atan2(dirToPlayer.x, dirToPlayer.z);
            enemy.group.rotation.y = angle;
        }

        // Animação procedural dos ossos (caminhada de zumbi)
        animateEnemyBones(enemy, time);
    }
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space': if (canJump) velocity.y += 150; canJump = false; break;
        case 'Digit1': switchWeapon(1); break;
        case 'Digit2': switchWeapon(2); break;
        case 'Digit3': switchWeapon(3); break;
        case 'KeyL':
            currentLevel = currentLevel === 3 ? 1 : currentLevel + 1;
            loadLevel(currentLevel);
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW': moveForward = false; break;
        case 'KeyA': moveLeft = false; break;
        case 'KeyS': moveBackward = false; break;
        case 'KeyD': moveRight = false; break;
    }
}

function updateWeaponHUD() {
    const config = weaponsConfig[currentWeapon];
    const weaponInfoEl = document.getElementById('weapon-info');
    if (weaponInfoEl && config) {
        weaponInfoEl.innerHTML = `Arma: ${config.name} <br><span style="font-size: 14px; color: #ff003c; text-shadow: 0 0 5px #ff003c;">${config.cadenceLabel}</span>`;
    }
}

function switchWeapon(id) {
    if (!weaponsConfig[id]) return;
    currentWeapon = id;
    updateWeaponHUD();

    // Atualiza a visibilidade e garante posição inicial dos modelos 3D
    for (let wId in weaponModels) {
        const model = weaponModels[wId];
        const cfg = weaponsConfig[wId];
        if (model && cfg) {
            if (model._recoilTimer) clearTimeout(model._recoilTimer);
            model.position.set(cfg.defaultPos.x, cfg.defaultPos.y, cfg.defaultPos.z);
            model.visible = (parseInt(wId) === currentWeapon);
        }
    }
}

function onMouseDown(event) {
    if (event.button !== 0) return; // Apenas clique com botão esquerdo
    initAudio();
    if (!controls.isLocked) return;
    isMouseDown = true;
    tryShoot();
}

function onMouseUp(event) {
    if (event.button === 0) {
        isMouseDown = false;
    }
}

function tryShoot() {
    if (!controls.isLocked) return;
    const now = performance.now();
    const config = weaponsConfig[currentWeapon];
    if (!config) return;

    // Respeita a cadência específica de cada arma
    if (now - lastShotTime < config.fireRate) {
        return;
    }

    lastShotTime = now;
    executeShot(config);
}

function executeShot(config) {
    // Animação de recuo ajustada para a arma atual
    const currentModel = weaponModels[currentWeapon];
    if (currentModel) {
        if (currentModel._recoilTimer) clearTimeout(currentModel._recoilTimer);
        currentModel.position.z = config.defaultPos.z + config.recoilZ;
        currentModel._recoilTimer = setTimeout(() => {
            currentModel.position.z = config.defaultPos.z;
        }, config.recoilDuration);
    }

    // Efeito de iluminação sincronizado
    scene.children.forEach(child => {
        if (child.isPointLight && child.color.getHex() === 0xff003c) {
            child.color.setHex(0xffffff);
            setTimeout(() => child.color.setHex(0xff003c), config.flashDuration);
        }
    });

    // Pulso dinâmico na mira (crosshair)
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        crosshair.style.transform = 'translate(-50%, -50%) scale(1.35)';
        setTimeout(() => {
            crosshair.style.transform = 'translate(-50%, -50%) scale(1)';
        }, 60);
    }

    // Disparo de som procedural adaptado para a arma
    playGunshotSound(currentWeapon);

    // Detecção de acerto nos inimigos via Raycast
    shootRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const enemyMeshes = [];
    enemies.forEach(enemy => {
        if (!enemy.alive || enemy.dying) return;
        enemy.model.traverse(child => {
            if (child.isSkinnedMesh) {
                enemyMeshes.push({ mesh: child, enemy: enemy });
            }
        });
    });
    const meshArray = enemyMeshes.map(e => e.mesh);
    const hits = shootRaycaster.intersectObjects(meshArray, false);
    if (hits.length > 0) {
        const hitMesh = hits[0].object;
        const hitEnemy = enemyMeshes.find(e => e.mesh === hitMesh);
        if (hitEnemy) {
            damageEnemy(hitEnemy.enemy, weaponDamage[currentWeapon] || 34);
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    shaderUniforms.time.value += delta;

    // Atualiza inimigos (animação + IA)
    updateEnemies(delta, time / 1000);

    if (controls.isLocked === true) {
        // Se o botão do mouse estiver pressionado, continua atirando de acordo com a cadência
        if (isMouseDown) {
            tryShoot();
        }
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;
        velocity.y -= 9.8 * 100.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        const speed = 400.0;
        if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

        const oldX = camera.position.x;
        const oldZ = camera.position.z;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);
        camera.position.y += (velocity.y * delta);

        const playerBox = new THREE.Box3();
        const playerRadius = 2.5;
        playerBox.min.set(camera.position.x - playerRadius, 0, camera.position.z - playerRadius);
        playerBox.max.set(camera.position.x + playerRadius, 20, camera.position.z + playerRadius);

        let isColliding = false;
        for (let i = 0; i < collidableBoxes.length; i++) {
            if (playerBox.intersectsBox(collidableBoxes[i])) {
                isColliding = true;
                break;
            }
        }

        if (isColliding) {
            camera.position.x = oldX;
            camera.position.z = oldZ;
            velocity.x = 0;
            velocity.z = 0;
        }

        if (camera.position.y < 10) {
            velocity.y = 0;
            camera.position.y = 10;
            canJump = true;
        }
    }

    prevTime = time;
    renderer.render(scene, camera);
}