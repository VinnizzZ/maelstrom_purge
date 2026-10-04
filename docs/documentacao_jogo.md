# Documentação do Projeto: Maelstrom Purge

Neste documento, detalhamos o processo de desenvolvimento do *Maelstrom Purge*, um FPS cyberpunk de navegador construído com Three.js. Destacamos o fluxo de trabalho com inteligência artificial, a resolução de problemas técnicos e a programação gráfica avançada.

---

## IAs Utilizadas e Fluxo de Prompts

A principal ferramenta de inteligência artificial utilizada como motor de co-criação foi o **Gemini**. O desenvolvimento foi conduzido de forma iterativa via engenharia de prompts:

*   **Prompt Inicial:** Solicitação da arquitetura base de um jogo de tiro WebGL em primeira pessoa inspirado em *Doom* e *Cyberpunk 2077*, contemplando um arsenal de três armas com três fases distintas, com estilo cyberpunk.
*   **Prompt:**
    "Eu preciso do código de um jogo de browser usando webgpl para o three.js que possua algum efeito de shader O jogo será igual o jogo Doom, mas com uma estética cyberpunk, o jogo deve ser em primeira pessoa, com um arsenal de 3 armas (um revolver, uma metralhadora e uma espada) os inimigos devem ser baseados na facção dos maelstrom do jogo Cyberpunk 2077 e o jogo deve ter três fases, a primeira será em uma boate cyberpunk baseada no Totentanz do Cyerpunk 2077, a segunda fase será um depósito e a última fase será em uma doca"
*   **Resposta Relevante (IA):** Geração do motor principal usando a biblioteca Three.js, incluindo movimentação vetorial baseada em física, sistema de colisão e gerenciamento da troca de armas. Apenas uma fase foi gerada por motivos de simplificação de escopo.

*   **Prompt de configuração do projeto:** Solicitação para configurar e baixar as dependências do projeto.
*   **Prompt:**
    "Quais são os passos e dependências que precisam ser configuradas para rodar esse projeto"
*   **Resposta Relevante (IA):** Passo a passo detalhado com comandos do terminal para configurar e instalar dependências e estrutura de pastas.

*   **Prompt de Expansão e Assets:** Solicitações para carregar modelos externos (Kenney.nl) e implementar IA inimiga animada.
*   **Prompts:**
    "Eu baixei o kit de modelos de assets de armas do kenny nl, como faço para colocar os modelos no jogo?"
    "Implementação de 10 inimigos no mapa utilizando o modelo 3D characterMedium.fbx localizado na pasta public/ e as skins zombieA.png e zombieC.png em public/Textures/, com animação procedural de zumbi, distribuição estratégica pelo mapa e integração com o sistema de combate/tiro."
*   **Resposta Relevante (IA):** Implementação nativa dos módulos `GLTFLoader` e `FBXLoader`, clonagem otimizada de malhas com `SkeletonUtils` e desenvolvimento de animações procedurais matemáticas para o esqueleto dos inimigos.

*   **Prompt de solicitação de shaders adicionais:** Solicitações para adicionar mais efeitos de shader (flash da arma e sange dos inimigos).
*   **Prompt:**
    "crie um efeito de flash e um efeito de partículas de sangue para rodar quando um inimigo for acertado utilizando shaders"
*   **Resposta Relevante (IA):** Criação dos efeitos utilizando `onBeforeCompile` e Vertex Shader.

---

## Erros Encontrados e Resoluções

Durante a integração dos sistemas, a equipe enfrentou e solucionou os seguintes desafios técnicos:

*   **Erro de Iluminação (Tela Preta):** Ao rodar o build no Vite, o jogo travou em uma tela preta apenas com o HUD visível. Versões recentes do Three.js exigem calibração de iluminação estritamente física. A equipe corrigiu o problema elevando a intensidade do `PointLight` de 1.5 para 1000 candelas.
*   **Prompt de correção:**
    "Ao rodar npm run dev e clicar na tela do menu para iniciar o jogo fica preso em uma tela preta apenas com algumas informações do HUD mas nada funciona"   
*   **Resposta Relevante (IA):** 
    "O problema visualizado em image_5014e5.png ocorre devido a uma atualização no motor de renderização das versões mais recentes do Three.js (r155+), que o Vite instala por padrão. Nessas versões modernas, a iluminação passou a ser estritamente física. O valor 1.5 de intensidade do PointLight, que nas versões antigas era considerado forte, agora equivale à luminosidade literal de uma vela (1,5 candelas). Isso mergulha todo o cenário em escuridão absoluta. Como você está preso em um ambiente escuro, mover o personagem com WASD ou clicar para atirar não produz nenhuma alteração visual na tela, criando a falsa impressão de que os controles não estão funcionando ou que o jogo travou."

*   **Crash de Controle Obsoleto:** O console do navegador apontou o erro fatal `TypeError: controls.getObject is not a function`. A solução foi refatorar a instanciação do `PointerLockControls`, adicionando a câmera nativamente à cena e manipulando suas coordenadas de forma direta.
*   **Prompt de correção:**
    "O jogo ainda fica travado no mesmo jeito, ao apertar as teclas 1, 2 e 3 do teclado o nome da arma não muda no HUD, acredito que o problema possa ser que o jogo está crashando logo no começo e não está rodando propriamente.
    Ao verificar o console do navegador o seguinte erro aparece:
    main.js:87
    Uncaught TypeError: controls.getObject is not a function at init (main.js:87:24)
    at main.js:54:1
    init@main.js:87"
    (anonymous)@main.js:54"
*   **Resposta Relevante (IA):**
    "Sua intuição está perfeitamente correta: se o texto da arma no HUD não muda ao pressionar 1, 2 ou 3, o JavaScript sofreu um erro fatal (crash) durante a inicialização. Isso impede que os "escutadores" de teclado sejam ativados e que a tela 3D seja desenhada, deixando você preso no HTML puro.
    O erro TypeError: controls.getObject is not a function acontece porque a função getObject() foi removida nas versões mais recentes do Three.js instaladas pelo Vite. Agora, o PointerLockControls manipula a câmera diretamente, tornando esse método obsoleto."

*   **Distorção de Texturas nos Inimigos:** As skins renderizaram de ponta-cabeça e deslocadas nos modelos FBX. Identificamos um conflito no mapeamento UV e corrigimos invertendo a propriedade `flipY` do `TextureLoader` para `true`.
*   **Prompt de correção:**
    "A skin dos inimigos nesse código está renderizando de maneira errada, ficando deslocada no modelo do personagem, leia o código main e tente identificar aonde pode estar acontecendo este erro"
*   **Resposta Relevante (IA):**
    "O problema de texturas deslocadas, borradas ou "bagunçadas" em modelos 3D no Three.js quase sempre tem um único culpado clássico: o eixo Y do mapeamento UV está invertido.Ao analisar o seu arquivo main.js, o erro está na função loadEnemyAssets(). Você configurou as texturas forçando o parâmetro flipY para false.   Embora modelos no formato .gltf e .glb realmente exijam que o flipY seja false, os modelos no formato .fbx (como os assets do Kenney) geralmente utilizam o mapeamento padrão do WebGL, que exige que o eixo Y seja invertido (true). Como o Y está falso, o modelo está vestindo a textura "de ponta-cabeça", fazendo com que o rosto pareça estar na perna, etc.Para corrigir isso imediatamente, basta alterar ou remover essa propriedade."

*   **Flash da arma não sai da arma:** Inicialmente o flash parecia estar saindo do centro do modelo do jogador ao invés de estar saindo diretamente do cano da arma.
*   **Prompt de correção:**
    "O efeito do flash está acontecendo, mas ele parece mais uma iluminação global, faça com que a fonte do flash seja no cano da arma e que a iluminação saia a partir dai "
*   **Resposta Relevante (IA):**
    "O motivo de o flash parecer global é porque o código anterior estava literalmente pegando a luz vermelha gigante do teto da boate (o neonLight posicionado no centro do mapa) e fazendo ela piscar em branco!

    Para consertar isso e criar um verdadeiro Muzzle Flash (clarão do cano da arma), precisamos criar uma luz dedicada anexada à câmera, posicionada exatamente na ponta da arma, que fica apagada (intensidade 0) e "explode" de luz apenas no momento do disparo."
---

## Adaptações de Shaders e Efeitos Visuais

Os shaders foram construídos do zero durante as iterações de código, dispensando pacotes pesados e garantindo performance e estilo sob medida:

*   **Estética Totentanz (Cenário):** O cenário utiliza um *Fragment Shader* customizado com interpolação linear (`mix`) guiada por ondas senoidais (`sin`) associadas ao tempo, gerando efeitos de *scanline* e pulso neon contínuo nas caixas.
*   **Hit Flash via GPU:** Para aplicar feedback visual de dano sem comprometer a CPU com trocas de material, utilizamos o método `onBeforeCompile` para injetar variáveis diretas no material base do Three.js, mesclando a textura com a cor vermelha e mantendo o sombreamento original.
*   **Física de Partículas (Sangue):** O sistema espirra o sangue processando a gravidade vetorial e a dissipação de opacidade (alfa) estritamente dentro do *Vertex Shader*, permitindo calcular dezenas de partículas dinâmicas simultaneamente durante um disparo de shotgun.

## Instruções para a execução do projeto
Certifique-se de ter o Git e o Node.js instalados na nova máquina.

* **Abra o terminal e clone o repositório do GitHub:**
Bash

git clone https://github.com/VinnizzZ/maelstrom_purge.git

* **Acesse a pasta do projeto recém-clonada:**
Bash

cd cyberpunk-fps

* **Instale todas as dependências do projeto (Vite, Three.js) mapeadas no arquivo package.json:**
Bash

npm install

* **Inicie o servidor local de desenvolvimento:**
Bash

npm run dev

O terminal exibirá um link de acesso local (geralmente http://localhost:5173/). Clique no link ou copie-o para o navegador para abrir o jogo.