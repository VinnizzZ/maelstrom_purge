import './style.css';
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'; // Novo: Import do GLTFLoader

// Configuração Base
let camera, scene, renderer, controls;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = false;

// Sistema de Colisão
let collidableBoxes = [];

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
}

function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW': moveForward = true; break;
        case 'KeyA': moveLeft = true; break;
        case 'KeyS': moveBackward = true; break;
        case 'KeyD': moveRight = true; break;
        case 'Space': if (canJump) velocity.y += 350; canJump = false; break;
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