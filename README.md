# Neon Rift Parkour 2D

Jogo de parkour 2D procedural feito com JavaScript puro + HTML5 Canvas.

## Como jogar
Abra `index.html` em um navegador moderno.

- A/D ou setas: mover
- Espaço/W/↑: pular
- Shift/K: dash
- R: reiniciar a sala
- P: pausar

## Versão expandida
- Menu inicial com seed personalizada.
- Seed compartilhável e geração determinística.
- 6 ambientes: caverna, floresta, cidade neon, vulcão, gelo e espaço.
- 7 zonas de física: baixa gravidade, gravidade invertida, super pulo, velocidade, câmera lenta, magnetismo e dash.
- Coyote time, jump buffer, pulo variável, wall slide e wall jump.
- Plataformas blink em ciclo 2s ligado / 1s desligado.
- Espinhos, lasers, blocos móveis e botões.
- Dificuldade progressiva e salas infinitas.
- Checkpoint automático: morrer reinicia a sala atual.
- Partículas, parallax, efeitos visuais das zonas e HUD.
- Áudio sintetizado para pulo, dash, zonas, morte e mudança de sala.
- Modo Speedrun com objetivo de 10 salas e recorde salvo no navegador.
- Recorde da maior sala alcançada salvo em localStorage.
- Editor simples de salas com plataforma, espinho, zona, blink e borracha.
- Sala customizada jogável diretamente pelo editor.

## Seed
No menu, coloque uma seed como `SENAI2026`. A mesma seed gera a mesma sequência de salas naquele código do jogo.

## Editor
No menu inicial, escolha `EDITOR DE SALA`, clique no grid para montar a fase e pressione `JOGAR SALA`.

## Observação
O áudio usa Web Audio API e começa após uma interação do usuário, conforme as regras dos navegadores.
