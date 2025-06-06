// === server.js ===
// Configuration du serveur et des dépendances
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const db = require("./database");
const os = require("os");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Récupération des adresses IP locales
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        addresses.push(addr.address);
      }
    }
  }

  return addresses;
}

// Configuration du dossier statique pour les fichiers clients
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Ajout des en-têtes CORS
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// Ajout de la gestion des erreurs pour les opérations de base de données
app.use((err, req, res, next) => {
  console.error("Erreur:", err);
  res.status(500).json({ error: "Erreur interne du serveur" });
});

// Point d'accès pour obtenir les informations du serveur
app.get("/api/server-info", (req, res) => {
  res.json({
    addresses: getLocalIPs(),
    port: server.address().port,
  });
});

// Points d'accès pour l'authentification
app.post("/api/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const player = await db.registerPlayer(username, password);
    res.json({ success: true, player });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const player = await db.loginPlayer(username, password);
    res.json({ success: true, player });
  } catch (error) {
    res.status(401).json({ success: false, error: error.message });
  }
});

// Point d'accès REST pour le classement
app.get("/api/rankings", async (req, res) => {
  try {
    const rankings = await db.getPlayerRankings();
    res.json(rankings);
  } catch (error) {
    res.status(500).json({ error: "Échec de la récupération du classement" });
  }
});

// Point d'accès pour les statistiques d'un joueur
app.get("/api/stats/:username", async (req, res) => {
  try {
    const stats = await db.getPlayerStats(req.params.username);
    res.json(stats);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Échec de la récupération des statistiques" });
  }
});

// Point d'accès pour la mise à jour des statistiques (pour les parties contre le bot)
app.post("/api/update-stats", async (req, res) => {
  try {
    const { username, result } = req.body;
    await db.updatePlayerStats(username, result);
    const updatedStats = await db.getPlayerStats(username);
    res.json(updatedStats);
  } catch (error) {
    res.status(500).json({ error: "Échec de la mise à jour des statistiques" });
  }
});

// Démarrage du serveur sur le port 8080 et toutes les interfaces
function startServer() {
  return new Promise((resolve, reject) => {
    try {
      server.listen(8080, "0.0.0.0", () => {
        const addresses = getLocalIPs();
        console.log("Serveur démarré sur:");
        console.log("- Local: http://localhost:8080");
        addresses.forEach((addr) => {
          console.log(`- Réseau: http://${addr}:8080`);
        });
        resolve(server);
      });

      server.on("error", (error) => {
        console.error("Erreur serveur:", error);
        reject(error);
      });

      // Gestion des erreurs WebSocket
      wss.on("error", (error) => {
        console.error("Erreur WebSocket:", error);
      });
    } catch (error) {
      console.error("Échec du démarrage du serveur:", error);
      reject(error);
    }
  });
}

// Démarrer le serveur si exécuté directement
if (require.main === module) {
  startServer().catch(console.error);
}

// Export pour utilisation dans Electron
module.exports = startServer();

// Variables globales pour la gestion des joueurs et des parties
let waitingPlayer = null;
const games = new Map();
const playerQueue = []; // File d'attente pour les joueurs
let lastFirstPlayer = null; // Suivi du dernier joueur ayant commencé

// Ajoute un joueur à la file d'attente
function addToQueue(ws) {
  playerQueue.push(ws);
  ws.send(
    JSON.stringify({
      type: "queue_position",
      position: playerQueue.length,
    })
  );
}

// Démarre une nouvelle partie entre deux joueurs
async function startGame(player1, player2) {
  const gameId = Date.now();
  console.log("Création d'une nouvelle partie avec l'ID:", gameId);

  // Détermine qui commence en fonction de la dernière partie
  const player1GoesFirst = lastFirstPlayer !== player1;
  lastFirstPlayer = player1GoesFirst ? player1 : player2;

  const firstPlayer = player1GoesFirst ? player1 : player2;
  const secondPlayer = player1GoesFirst ? player2 : player1;

  // Initialisation de l'état de la partie
  games.set(gameId, {
    player1,
    player2,
    board: Array(9).fill(null),
    turn: "X",
    gameId: gameId,
    player1GoesFirst, // Stocke qui a commencé la partie
  });

  // Configuration des références des joueurs
  player1.opponent = player2;
  player2.opponent = player1;
  player1.gameId = gameId;
  player2.gameId = gameId;

  // Récupération des statistiques des deux joueurs
  try {
    const [player1Stats, player2Stats] = await Promise.all([
      db.getPlayerStats(player1.playerName),
      db.getPlayerStats(player2.playerName),
    ]);

    // Envoi des statistiques aux deux joueurs
    player1.send(
      JSON.stringify({
        type: "stats_update",
        stats: player1Stats,
      })
    );
    player1.send(
      JSON.stringify({
        type: "stats_update",
        stats: player2Stats,
      })
    );
    player2.send(
      JSON.stringify({
        type: "stats_update",
        stats: player2Stats,
      })
    );
    player2.send(
      JSON.stringify({
        type: "stats_update",
        stats: player1Stats,
      })
    );
  } catch (error) {
    console.error("Erreur lors de la récupération des statistiques:", error);
  }

  // Envoi des informations de départ aux joueurs
  firstPlayer.send(
    JSON.stringify({
      type: "start",
      mark: "X",
      opponent: secondPlayer.playerName,
    })
  );
  secondPlayer.send(
    JSON.stringify({
      type: "start",
      mark: "O",
      opponent: firstPlayer.playerName,
    })
  );
}

// Remplace un joueur par un nouveau dans une partie existante
async function replacePlayer(oldPlayer, newPlayer, gameId) {
  console.log(
    "Remplacement du joueur:",
    oldPlayer.playerName,
    "par",
    newPlayer.playerName
  );
  console.log("ID de la partie pour le remplacement:", gameId);

  const game = games.get(gameId);
  if (!game) {
    console.error("Partie non trouvée pour le remplacement:", gameId);
    return;
  }

  // Ajoute l'ancien joueur (perdant) à la file d'attente
  addToQueue(oldPlayer);
  console.log("Ajout de", oldPlayer.playerName, "à la file d'attente");

  const otherPlayer = oldPlayer === game.player1 ? game.player2 : game.player1;

  // Mise à jour des références
  newPlayer.gameId = gameId;
  newPlayer.opponent = otherPlayer;
  otherPlayer.opponent = newPlayer;

  // Mise à jour des références dans l'objet partie
  if (oldPlayer === game.player1) {
    game.player1 = newPlayer;
  } else {
    game.player2 = newPlayer;
  }

  console.log("Références de la partie après mise à jour:");
  console.log("- ID de la partie:", game.gameId);
  console.log("- ID du Joueur1:", game.player1.gameId);
  console.log("- ID du Joueur2:", game.player2.gameId);

  // Récupération des statistiques des deux joueurs
  try {
    const [newPlayerStats, otherPlayerStats] = await Promise.all([
      db.getPlayerStats(newPlayer.playerName),
      db.getPlayerStats(otherPlayer.playerName),
    ]);

    // Envoi des statistiques aux deux joueurs
    newPlayer.send(
      JSON.stringify({
        type: "stats_update",
        stats: newPlayerStats,
      })
    );
    newPlayer.send(
      JSON.stringify({
        type: "stats_update",
        stats: otherPlayerStats,
      })
    );
    otherPlayer.send(
      JSON.stringify({
        type: "stats_update",
        stats: otherPlayerStats,
      })
    );
    otherPlayer.send(
      JSON.stringify({
        type: "stats_update",
        stats: newPlayerStats,
      })
    );
  } catch (error) {
    console.error("Erreur lors de la récupération des statistiques:", error);
  }

  // Réinitialisation du plateau
  game.board = Array(9).fill(null);
  game.turn = "X";

  // Détermine qui commence la nouvelle partie
  const player1GoesFirst = lastFirstPlayer !== game.player1;
  lastFirstPlayer = player1GoesFirst ? game.player1 : game.player2;
  game.player1GoesFirst = player1GoesFirst;

  const firstPlayer = player1GoesFirst ? game.player1 : game.player2;
  const secondPlayer = player1GoesFirst ? game.player2 : game.player1;

  console.log(
    "Démarrage d'une nouvelle partie entre:",
    firstPlayer.playerName,
    "(X) et",
    secondPlayer.playerName,
    "(O)"
  );

  // Envoi des informations de départ aux joueurs
  firstPlayer.send(
    JSON.stringify({
      type: "start",
      mark: "X",
      opponent: secondPlayer.playerName,
    })
  );
  secondPlayer.send(
    JSON.stringify({
      type: "start",
      mark: "O",
      opponent: firstPlayer.playerName,
    })
  );

  return game;
}

// Gère le remplacement d'un joueur et la mise à jour de la file d'attente
async function checkAndReplacePlayer(game, leavingPlayer, isWinner) {
  if (playerQueue.length > 0) {
    const newPlayer = playerQueue.shift();
    await replacePlayer(leavingPlayer, newPlayer, game.gameId);

    // Mise à jour des positions dans la file d'attente
    playerQueue.forEach((player, index) => {
      player.send(
        JSON.stringify({
          type: "queue_position",
          position: index + 1,
        })
      );
    });
  } else {
    // Si pas de joueurs en attente, nettoyage de la partie
    if (leavingPlayer.opponent) {
      leavingPlayer.opponent.send(JSON.stringify({ type: "opponent_left" }));
      leavingPlayer.opponent.opponent = null;
    }
    games.delete(leavingPlayer.gameId);
  }
}

// Gestion des connexions WebSocket
wss.on("connection", function connection(ws) {
  ws.on("message", async function incoming(message) {
    const data = JSON.parse(message);
    console.log("Message reçu:", data.type, "de", ws.playerName);

    // Gestion de l'enregistrement du nom du joueur
    if (data.type === "set_name") {
      ws.playerName = data.name;
      console.log(`${data.name} connecté.`);

      // Récupération ou création des statistiques du joueur
      try {
        const stats = await db.getPlayerStats(data.name);
        ws.send(
          JSON.stringify({
            type: "stats_update",
            stats: stats,
          })
        );
      } catch (error) {
        console.error(
          "Erreur lors de la récupération des statistiques du joueur:",
          error
        );
      }

      // Matchmaking automatique uniquement si explicitement demandé
      if (data.autoMatch !== false) {
        // Vérifie s'il y a des parties actives
        const activeGames = games.size > 0;

        if (!waitingPlayer && !activeGames) {
          waitingPlayer = ws;
          ws.send(JSON.stringify({ type: "waiting" }));
        } else if (!waitingPlayer && activeGames) {
          // S'il y a des parties actives, ajoute le nouveau joueur à la file d'attente
          addToQueue(ws);
        } else if (waitingPlayer) {
          await startGame(waitingPlayer, ws);
          waitingPlayer = null;
        }
      }
    }

    // Gestion de la demande de match
    if (data.type === "find_match") {
      console.log(`${ws.playerName} recherche une partie`);

      // Retire d'abord de la file d'attente existante
      const queueIndex = playerQueue.indexOf(ws);
      if (queueIndex !== -1) {
        playerQueue.splice(queueIndex, 1);
      }

      if (!waitingPlayer) {
        waitingPlayer = ws;
        ws.send(JSON.stringify({ type: "waiting" }));
      } else if (waitingPlayer !== ws) {
        await startGame(waitingPlayer, ws);
        waitingPlayer = null;
      }
    }

    // Gestion des coups joués
    if (data.type === "move" && ws.opponent) {
      const game = games.get(ws.gameId);
      if (!game) {
        console.log(
          "Partie non trouvée pour l'ID:",
          ws.gameId,
          "Joueur:",
          ws.playerName
        );
        console.log("Parties en cours:", Array.from(games.keys()));
        console.log("ID de partie du joueur:", ws.gameId);
        console.log("Nombre de parties:", games.size);
        return;
      }
      if (game.board[data.index] !== null) {
        console.log("Coup invalide: case déjà prise");
        return;
      }

      // Détermine le symbole du joueur en fonction de qui a commencé
      const isFirstPlayer =
        (game.player1GoesFirst && game.player1 === ws) ||
        (!game.player1GoesFirst && game.player2 === ws);
      const mark = isFirstPlayer ? "X" : "O";

      if (game.turn !== mark) {
        console.log("Coup invalide: ce n'est pas votre tour");
        return;
      }

      console.log(
        "Coup valide par",
        ws.playerName,
        ":",
        data.index,
        "avec le symbole",
        mark
      );

      // Mise à jour du plateau et du tour
      game.board[data.index] = mark;
      game.turn = mark === "X" ? "O" : "X";

      // Envoi du coup aux deux joueurs
      const player1 = game.player1;
      const player2 = game.player2;

      const moveData = JSON.stringify({
        type: "move",
        index: data.index,
        mark: mark,
        turn: game.turn,
      });

      console.log("Envoi du coup aux deux joueurs");
      player1.send(moveData);
      player2.send(moveData);

      // Mise à jour du tour pour les deux joueurs
      const turnData = JSON.stringify({
        type: "turn_update",
        turn: game.turn,
      });
      player1.send(turnData);
      player2.send(turnData);

      // Vérification de fin de partie
      const winner = checkWinner(game.board);
      if (winner || game.board.every((cell) => cell !== null)) {
        console.log("Partie terminée. Gagnant:", winner);
        const result = winner
          ? { type: "game_over", winner }
          : { type: "game_over", winner: null };

        player1.send(JSON.stringify(result));
        player2.send(JSON.stringify(result));

        // Mise à jour des statistiques des joueurs
        try {
          if (winner) {
            const winningPlayer =
              (game.player1GoesFirst && winner === "X") ||
              (!game.player1GoesFirst && winner === "O")
                ? game.player1
                : game.player2;
            const losingPlayer =
              winningPlayer === game.player1 ? game.player2 : game.player1;

            await Promise.all([
              db.updatePlayerStats(winningPlayer.playerName, "win"),
              db.updatePlayerStats(losingPlayer.playerName, "loss"),
            ]);

            // Envoi des statistiques mises à jour aux deux joueurs
            const [winnerStats, loserStats] = await Promise.all([
              db.getPlayerStats(winningPlayer.playerName),
              db.getPlayerStats(losingPlayer.playerName),
            ]);

            winningPlayer.send(
              JSON.stringify({
                type: "stats_update",
                stats: winnerStats,
              })
            );
            losingPlayer.send(
              JSON.stringify({
                type: "stats_update",
                stats: loserStats,
              })
            );
          } else {
            // Match nul
            await Promise.all([
              db.updatePlayerStats(game.player1.playerName, "draw"),
              db.updatePlayerStats(game.player2.playerName, "draw"),
            ]);

            // Envoi des statistiques mises à jour aux deux joueurs
            const [player1Stats, player2Stats] = await Promise.all([
              db.getPlayerStats(game.player1.playerName),
              db.getPlayerStats(game.player2.playerName),
            ]);

            game.player1.send(
              JSON.stringify({
                type: "stats_update",
                stats: player1Stats,
              })
            );
            game.player2.send(
              JSON.stringify({
                type: "stats_update",
                stats: player2Stats,
              })
            );
          }
        } catch (error) {
          console.error(
            "Erreur lors de la mise à jour des statistiques du joueur:",
            error
          );
        }

        if (winner) {
          // Détermine le gagnant en fonction de qui a commencé
          const isXWinner = winner === "X";
          const winningPlayer =
            (game.player1GoesFirst && isXWinner) ||
            (!game.player1GoesFirst && !isXWinner)
              ? game.player1
              : game.player2;
          const losingPlayer =
            winningPlayer === game.player1 ? game.player2 : game.player1;

          console.log(
            "Gagnant:",
            winningPlayer.playerName,
            "Perdant:",
            losingPlayer.playerName
          );

          if (playerQueue.length === 0) {
            // Pas de joueurs en attente, demande aux deux joueurs s'ils veulent continuer
            console.log(
              "Pas de joueurs en attente - demande aux deux joueurs s'ils veulent continuer"
            );
            winningPlayer.send(JSON.stringify({ type: "continue_prompt" }));
            losingPlayer.send(JSON.stringify({ type: "continue_prompt" }));

            // Stocke qu'on attend les réponses des deux joueurs et qui a gagné
            game.winResponses = {
              winnerResponse: null,
              loserResponse: null,
              winner: winningPlayer,
              loser: losingPlayer,
            };
          } else {
            // Il y a des joueurs en attente, demande seulement au gagnant
            winningPlayer.send(JSON.stringify({ type: "continue_prompt" }));

            // Ajoute automatiquement le perdant à la file d'attente
            addToQueue(losingPlayer);
            console.log(
              "Ajout automatique du perdant",
              losingPlayer.playerName,
              "à la file d'attente"
            );

            if (playerQueue.length > 0) {
              losingPlayer.opponent = null;
            }
          }
        } else {
          // Gestion du match nul
          console.log("Partie terminée sur un match nul");

          if (playerQueue.length === 0) {
            // Pas de joueurs en attente, demande aux deux joueurs s'ils veulent continuer
            console.log(
              "Pas de joueurs en attente - demande aux deux joueurs s'ils veulent continuer"
            );
            player1.send(JSON.stringify({ type: "continue_prompt" }));
            player2.send(JSON.stringify({ type: "continue_prompt" }));

            // Stocke qu'on attend les réponses des deux joueurs
            game.drawResponses = {
              player1Response: null,
              player2Response: null,
            };
          } else {
            // Il y a des joueurs en attente, démarre automatiquement une nouvelle partie
            console.log(
              "Joueurs en attente - Démarrage d'une nouvelle partie avec les mêmes joueurs"
            );

            // Réinitialisation du plateau
            game.board = Array(9).fill(null);
            game.turn = "X";

            // Alterne qui commence
            game.player1GoesFirst = !game.player1GoesFirst;

            const firstPlayer = game.player1GoesFirst
              ? game.player1
              : game.player2;
            const secondPlayer = game.player1GoesFirst
              ? game.player2
              : game.player1;

            console.log(
              "Démarrage d'une nouvelle partie entre:",
              firstPlayer.playerName,
              "(X) et",
              secondPlayer.playerName,
              "(O)"
            );

            firstPlayer.send(
              JSON.stringify({
                type: "start",
                mark: "X",
                opponent: secondPlayer.playerName,
              })
            );
            secondPlayer.send(
              JSON.stringify({
                type: "start",
                mark: "O",
                opponent: firstPlayer.playerName,
              })
            );
          }
        }
      }
    }

    // Gestion des demandes de statistiques
    if (data.type === "request_stats") {
      try {
        const stats = await db.getPlayerStats(data.username);
        ws.send(
          JSON.stringify({
            type: "stats_update",
            stats: stats,
          })
        );
      } catch (error) {
        console.error(
          "Erreur lors de la récupération des statistiques du joueur:",
          error
        );
      }
    }

    // Gestion des choix de continuation
    if (data.type === "continue_choice") {
      const gameId = ws.gameId;
      const game = games.get(gameId);

      if (!game) {
        console.log("Partie non trouvée pour le choix de continuation");
        return;
      }

      console.log(
        "Choix de continuation de",
        ws.playerName,
        ":",
        data.continue
      );

      // Vérifie si c'est une réponse à un match nul
      if (game.drawResponses) {
        // Stocke la réponse du joueur
        if (game.player1 === ws) {
          game.drawResponses.player1Response = data.continue;
        } else {
          game.drawResponses.player2Response = data.continue;
        }

        // Vérifie si on a les deux réponses
        if (
          game.drawResponses.player1Response !== null &&
          game.drawResponses.player2Response !== null
        ) {
          if (
            game.drawResponses.player1Response &&
            game.drawResponses.player2Response
          ) {
            // Les deux joueurs veulent continuer
            console.log(
              "Les deux joueurs ont choisi de continuer après le match nul"
            );

            // Réinitialisation du plateau
            game.board = Array(9).fill(null);
            game.turn = "X";

            // Alterne qui commence
            game.player1GoesFirst = !game.player1GoesFirst;

            const firstPlayer = game.player1GoesFirst
              ? game.player1
              : game.player2;
            const secondPlayer = game.player1GoesFirst
              ? game.player2
              : game.player1;

            console.log(
              "Démarrage d'une nouvelle partie entre:",
              firstPlayer.playerName,
              "(X) et",
              secondPlayer.playerName,
              "(O)"
            );

            firstPlayer.send(
              JSON.stringify({
                type: "start",
                mark: "X",
                opponent: secondPlayer.playerName,
              })
            );
            secondPlayer.send(
              JSON.stringify({
                type: "start",
                mark: "O",
                opponent: firstPlayer.playerName,
              })
            );
          } else {
            // Au moins un joueur veut partir
            console.log(
              "Au moins un joueur a choisi de ne pas continuer après le match nul"
            );

            // Ajoute les joueurs qui veulent continuer à la file d'attente
            if (game.drawResponses.player1Response) {
              addToQueue(game.player1);
            }
            if (game.drawResponses.player2Response) {
              addToQueue(game.player2);
            }

            // Nettoyage de la partie
            game.player1.opponent = null;
            game.player2.opponent = null;
            games.delete(gameId);
          }

          // Efface les réponses du match nul
          delete game.drawResponses;
        }
        return;
      }

      // Vérifie si c'est une réponse à une victoire sans file d'attente
      if (game.winResponses) {
        // Stocke la réponse du joueur
        if (ws === game.winResponses.winner) {
          game.winResponses.winnerResponse = data.continue;
        } else {
          game.winResponses.loserResponse = data.continue;
        }

        // Vérifie si on a les deux réponses
        if (
          game.winResponses.winnerResponse !== null &&
          game.winResponses.loserResponse !== null
        ) {
          if (
            game.winResponses.winnerResponse &&
            game.winResponses.loserResponse
          ) {
            // Les deux joueurs veulent continuer
            console.log(
              "Les deux joueurs ont choisi de continuer après la victoire"
            );

            // Réinitialisation du plateau
            game.board = Array(9).fill(null);
            game.turn = "X";

            // Alterne qui commence
            game.player1GoesFirst = !game.player1GoesFirst;

            const firstPlayer = game.player1GoesFirst
              ? game.player1
              : game.player2;
            const secondPlayer = game.player1GoesFirst
              ? game.player2
              : game.player1;

            console.log(
              "Démarrage d'une nouvelle partie entre:",
              firstPlayer.playerName,
              "(X) et",
              secondPlayer.playerName,
              "(O)"
            );

            firstPlayer.send(
              JSON.stringify({
                type: "start",
                mark: "X",
                opponent: secondPlayer.playerName,
              })
            );
            secondPlayer.send(
              JSON.stringify({
                type: "start",
                mark: "O",
                opponent: firstPlayer.playerName,
              })
            );
          } else {
            // Au moins un joueur veut partir
            console.log(
              "Au moins un joueur a choisi de ne pas continuer après la victoire"
            );

            // Ajoute les joueurs qui veulent continuer à la file d'attente
            if (game.winResponses.winnerResponse) {
              addToQueue(game.winResponses.winner);
            }
            if (game.winResponses.loserResponse) {
              addToQueue(game.winResponses.loser);
            }

            // Nettoyage de la partie
            game.player1.opponent = null;
            game.player2.opponent = null;
            games.delete(gameId);
          }

          // Efface les réponses de la victoire
          delete game.winResponses;
        }
        return;
      }

      // Gestion du choix normal de continuation (quand il y a des joueurs en attente)
      if (data.continue) {
        if (playerQueue.length > 0) {
          const newPlayer = playerQueue.shift();
          const opponent = ws.opponent;

          console.log("Remplacement du joueur dans le choix de continuation");
          console.log("ID de partie actuel:", gameId);
          console.log("La partie existe:", games.has(gameId));
          console.log(
            "Taille de la file d'attente avant remplacement:",
            playerQueue.length
          );

          opponent.opponent = null;
          const updatedGame = await replacePlayer(opponent, newPlayer, gameId);

          if (!updatedGame) {
            console.error("Échec du remplacement du joueur");
            return;
          }

          console.log(
            "Taille de la file d'attente après remplacement:",
            playerQueue.length
          );

          // Mise à jour des positions dans la file d'attente
          playerQueue.forEach((player, index) => {
            player.send(
              JSON.stringify({
                type: "queue_position",
                position: index + 1,
              })
            );
          });
        } else {
          ws.send(JSON.stringify({ type: "waiting_for_opponent" }));
        }
      } else {
        // Si le gagnant choisit de partir, l'ajoute aussi à la file d'attente
        ws.opponent = null;
        addToQueue(ws);
        await checkAndReplacePlayer(game, ws, true);
      }
    }

    // Gestion de la demande de rejoindre la file d'attente
    if (data.type === "join_queue") {
      addToQueue(ws);
      ws.send(
        JSON.stringify({
          type: "queue_joined",
          position: playerQueue.length,
        })
      );
    }
  });

  // Gestion de la déconnexion d'un joueur
  ws.on("close", async () => {
    // Retire le joueur de la file d'attente s'il y était
    const queueIndex = playerQueue.indexOf(ws);
    if (queueIndex !== -1) {
      playerQueue.splice(queueIndex, 1);
      // Mise à jour des positions pour les joueurs restants
      playerQueue.forEach((player, index) => {
        player.send(
          JSON.stringify({
            type: "queue_position",
            position: index + 1,
          })
        );
      });
    }

    if (waitingPlayer === ws) {
      waitingPlayer = null;
    }

    const game = games.get(ws.gameId);
    if (game) {
      if (ws.opponent) {
        ws.opponent.opponent = null; // Efface d'abord la référence de l'adversaire
        ws.opponent = null; // Efface la référence de ce joueur
      }
      await checkAndReplacePlayer(game, ws, false);
    }
  });
});

// Vérifie s'il y a un gagnant
function checkWinner(board) {
  const wins = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8], // Lignes
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8], // Colonnes
    [0, 4, 8],
    [2, 4, 6], // Diagonales
  ];
  for (const [a, b, c] of wins) {
    if (board[a] && board[a] === board[b] && board[b] === board[c]) {
      return board[a];
    }
  }
  return null;
}
