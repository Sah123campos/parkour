# Neon Rift Parkour 2D

Jogo de parkour 2D procedural feito com JavaScript puro + HTML5 Canvas.

## Como jogar
Abra `index.html` em um navegador moderno.

- A/D ou setas: mover
- Espaço/W/↑: pular
- Shift/K: dash
- E: ativar interruptores próximos e ligar plataformas blink próximas por 5 segundos
- R: reiniciar a sala
- P: pausar
- M: ligar/desligar a música

## Versão expandida
- Menu inicial com seed personalizada.
- Seed compartilhável e geração determinística.
- 6 ambientes: caverna, floresta, cidade neon, vulcão, gelo e espaço.
- Plataformas alinhadas entre o início e a saída, com espaços e desníveis de salto limitados.
- 7 zonas de física: baixa gravidade, gravidade invertida, super pulo, velocidade, câmera lenta, magnetismo e dash.
- Coyote time, jump buffer, pulo variável, wall slide e wall jump.
- Plataformas blink em ciclo 2s ligado / 1s desligado; interruptores próximos podem mantê-las ligadas por 5 segundos.
- Zonas de efeito posicionadas sobre plataformas alcançáveis; a zona de impulso reforça o dash com Shift/K.
- Espinhos, lasers, blocos móveis e botões.
- Dificuldade progressiva e salas infinitas.
- Checkpoint automático: morrer reinicia a sala atual.
- Partículas, parallax, efeitos visuais das zonas e HUD.
- Áudio sintetizado para pulo, dash, zonas, morte e mudança de sala.
- Trilhas originais sintetizadas que mudam com o ambiente e podem ser desligadas com M.
- Modo Speedrun com objetivo de 10 salas e recorde salvo no navegador.
- Recorde da maior sala alcançada salvo em localStorage.
- Editor simples de salas com plataforma, espinho, zona, blink e borracha.
- Sala customizada jogável diretamente pelo editor.

## Seed
No menu, coloque uma seed como `SENAI2026`. A mesma seed gera a mesma sequência de salas naquele código do jogo.

## Multiplayer online (Firebase)
O multiplayer usa Firebase Authentication anônima e Realtime Database. Para habilitá-lo:

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com/) e adicione um app da Web.
2. Ative **Authentication > Sign-in method > Anonymous**.
3. Crie um **Realtime Database** e copie sua URL (por exemplo, `https://seu-projeto-default-rtdb.firebaseio.com`).
4. Copie a configuração do app da Web para `firebase-config.js`, substituindo os valores `YOUR_...`.
5. Em **Realtime Database > Rules**, publique estas regras:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": "auth != null",
        "seed": {
          ".write": "auth != null && !data.exists()"
        },
        "players": {
          "$uid": {
            ".write": "auth != null && auth.uid === $uid"
          }
        }
      }
    }
  }
}
```

6. Sirva a pasta por HTTP(S) (por exemplo, usando a extensão Live Server do VS Code); não abra o HTML como `file://`.
7. Crie uma sala e compartilhe o código de seis caracteres. Seus amigos abrem o mesmo site, digitam o código e entram.

Cada jogador percorre as salas por conta própria usando a seed da sala. Os personagens aparecem um para o outro quando estão na mesma sala do jogo. O arquivo `firebase-config.js` contém configuração pública do app; o controle de acesso é feito pelas regras do banco acima.

## Editor
No menu inicial, escolha `EDITOR DE SALA`, clique no grid para montar a fase e pressione `JOGAR SALA`.

## Observação
O áudio usa Web Audio API e começa após uma interação do usuário, conforme as regras dos navegadores.
