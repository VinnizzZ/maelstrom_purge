# Plano de Implementação: Inimigos Animados com Skins Aleatórias

Implementação de 10 inimigos no mapa utilizando o modelo 3D `characterMedium.fbx` localizado na pasta `public/` e as skins `zombieA.png` e `zombieC.png` em `public/Textures/`, com animação procedural de zumbi, distribuição estratégica pelo mapa e integração com o sistema de combate/tiro.

## Informações e Descobertas Técnicas

1. **Modelo 3D (`characterMedium.fbx`)**:
   - É um `SkinnedMesh` com esqueleto completo (58 ossos: Hips, Pernas, Coluna, Braços, Cabeça, etc.).
   - Dimensões originais: altura ~376 unidades. Com escala de `~0.027`, sua altura ficará em ~10 unidades, compatível com a visão do jogador (`camera.position.y = 10`) e os obstáculos do mapa.
2. **Texturas e Skins**:
   - Localizadas em `public/Textures/zombieA.png` e `public/Textures/zombieC.png` (resolução 1024x1024).
   - O mapeamento UV do modelo se alinha com essas texturas.
   - Para cada um dos 10 inimigos, a textura será sorteada aleatoriamente (50% de chance para cada skin).
3. **Animação**:
   - Como o modelo possui esqueleto articulado (`SkinnedMesh`), implementaremos uma animação procedural de zumbi autêntica:
     - Postura curvada com cabeça oscilando e braços estendidos para frente.
     - Ciclo de marcha (pernas alternadas e oscilação dos braços e quadril) com offset de tempo individual para cada zumbi não se mover em sincronia mecânica.
4. **Comportamento e Combate**:
   - Os inimigos se viram e caminham em direção ao jogador na densa névoa cyberpunk.
   - Detecção de tiro via Raycast: ao disparar contra os inimigos, eles tomam dano, piscam em vermelho com efeito de impacto e caem derrotados ao zerar a vida.
   - Contador de inimigos restantes integrado ao HUD (`Inimigos: X / 10`).

---

## Modificações Propostas

### 1. `src/main.js`
- Importar `FBXLoader` (`three/addons/loaders/FBXLoader.js`) e `SkeletonUtils` (`three/addons/utils/SkeletonUtils.js`).
- Pré-carregar as texturas `zombieA.png` e `zombieC.png` e o modelo `characterMedium.fbx`.
- Criar a função `spawnEnemies(count = 10)`:
  - Limpar inimigos anteriores ao trocar ou reiniciar a fase.
  - Sortear aleatoriamente entre `zombieA` e `zombieC` para cada inimigo.
  - Clonar o modelo base com `SkeletonUtils.clone` para preservar a integridade da malha e dos ossos.
  - Aplicar o material adequado com a skin selecionada.
  - Posicionar os 10 inimigos pelo mapa sobre o chão (`y = 0`), evitando colisões com blocos de obstáculo e a posição inicial do jogador.
- Criar a função `updateEnemies(delta, time)` no loop `animate()`:
  - Movimentar os inimigos em direção ao jogador.
  - Atualizar os ossos para o ciclo de passos e postura zumbi.
  - Gerenciar animação de morte dos inimigos abatidos.
- Atualizar `executeShot(config)`:
  - Adicionar teste de colisão por raio (`Raycaster`) a partir do centro da mira da câmera contra as malhas dos inimigos.
  - Aplicar dano, reação visual de impacto (brilho vermelho na malha) e remover/derrotar inimigos com vida zerada.
  - Atualizar o contador no HUD.

### 2. `index.html` e `src/style.css`
- Adicionar no HUD o elemento `#enemy-info` com estilo cyberpunk (neon e tipografia condizente) para exibir `Inimigos: X / 10`.

---

## Plano de Verificação

### Testes Manuais e Verificação Visual
1. **Verificação de Build**:
   - Rodar `npm.cmd run build` para garantir que os módulos, imports e sintaxe estão válidos sem erros de compilação.
2. **Execução e Teste no Navegador**:
   - Iniciar o servidor de desenvolvimento Vite (`npm.cmd run dev`).
   - Abrir a aplicação via subagente de navegador.
   - Validar:
     - Presença de 10 inimigos no mapa.
     - Presença visual de ambas as skins (`zombieA` e `zombieC`) distribuídas aleatoriamente.
     - Animações dos inimigos em funcionamento (passos, balanço e postura).
     - Mecânica de tiro atingindo e derrotando os inimigos.
     - Atualização do contador no HUD.
   - Capturar screenshots para comprovação visual.
