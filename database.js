const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

// Création/connexion à la base de données SQLite
const db = new sqlite3.Database(path.join(__dirname, 'tictactoe.db'), (err) => {
    if (err) {
        console.error('Erreur de connexion à la base de données:', err);
    } else {
        console.log('Connecté à la base de données SQLite');
        initDatabase();
    }
});

// Hachage du mot de passe avec sel
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { hash, salt };
}

// Vérification du mot de passe
function verifyPassword(password, hash, salt) {
    const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return verifyHash === hash;
}

// Validation du nom d'utilisateur
function isValidUsername(username) {
    // Uniquement lettres et chiffres, 3-16 caractères
    const usernameRegex = /^[a-zA-Z0-9]{3,16}$/;
    return usernameRegex.test(username);
}

// Initialisation des tables de la base de données
function initDatabase() {
    db.run(`CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        total_games INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error('Erreur lors de la création de la table players:', err);
        } else {
            console.log('Table players prête');
        }
    });
}

// Inscription d'un nouveau joueur
function registerPlayer(username, password) {
    return new Promise((resolve, reject) => {
        // Validation du nom d'utilisateur
        if (!isValidUsername(username)) {
            reject(new Error('Nom d\'utilisateur invalide. Utilisez 3-16 caractères, lettres et chiffres uniquement.'));
            return;
        }

        // Hachage du mot de passe
        const { hash, salt } = hashPassword(password);

        // Vérification si le nom d'utilisateur existe (insensible à la casse)
        db.get('SELECT username FROM players WHERE username = ? COLLATE NOCASE', [username], (err, row) => {
            if (err) {
                reject(err);
            } else if (row) {
                reject(new Error('Nom d\'utilisateur déjà existant'));
            } else {
                // Insertion du nouveau joueur
                db.run(
                    'INSERT INTO players (username, password_hash, password_salt) VALUES (?, ?, ?)',
                    [username, hash, salt],
                    function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({
                                id: this.lastID,
                                username,
                                total_games: 0,
                                wins: 0,
                                draws: 0,
                                losses: 0,
                                winrate: 0
                            });
                        }
                    }
                );
            }
        });
    });
}

// Connexion d'un joueur
function loginPlayer(username, password) {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT id, username, password_hash, password_salt, total_games, wins, draws, losses FROM players WHERE username = ? COLLATE NOCASE',
            [username],
            (err, row) => {
                if (err) {
                    reject(err);
                } else if (!row) {
                    reject(new Error('Nom d\'utilisateur ou mot de passe invalide'));
                } else if (!verifyPassword(password, row.password_hash, row.password_salt)) {
                    reject(new Error('Nom d\'utilisateur ou mot de passe invalide'));
                } else {
                    const { password_hash, password_salt, ...playerData } = row;
                    playerData.winrate = row.total_games > 0 ? row.wins / row.total_games : 0;
                    resolve(playerData);
                }
            }
        );
    });
}

// Mise à jour des statistiques du joueur après une partie
function updatePlayerStats(username, result) {
    return new Promise((resolve, reject) => {
        let updates = {
            total_games: 'total_games + 1'
        };
        
        if (result === 'win') {
            updates.wins = 'wins + 1';
        } else if (result === 'loss') {
            updates.losses = 'losses + 1';
        } else if (result === 'draw') {
            updates.draws = 'draws + 1';
        }

        const setClause = Object.entries(updates)
            .map(([key, value]) => `${key} = ${value}`)
            .join(', ');

        db.run(
            `UPDATE players SET ${setClause} WHERE username = ? COLLATE NOCASE`,
            [username],
            function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            }
        );
    });
}

// Récupération du classement des joueurs
function getPlayerRankings() {
    return new Promise((resolve, reject) => {
        db.all(
            `SELECT 
                username,
                total_games,
                wins,
                draws,
                losses,
                CAST(wins AS FLOAT) / CASE WHEN total_games = 0 THEN 1 ELSE total_games END as winrate
            FROM players
            WHERE total_games > 0
            ORDER BY winrate DESC, total_games DESC
            LIMIT 10`,
            [],
            (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            }
        );
    });
}

// Récupération des statistiques d'un joueur
function getPlayerStats(username) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT 
                username,
                total_games,
                wins,
                draws,
                losses,
                CAST(wins AS FLOAT) / CASE WHEN total_games = 0 THEN 1 ELSE total_games END as winrate
            FROM players
            WHERE username = ? COLLATE NOCASE`,
            [username],
            (err, row) => {
                if (err) {
                    reject(err);
                } else if (!row) {
                    reject(new Error('Joueur non trouvé'));
                } else {
                    resolve(row);
                }
            }
        );
    });
}

module.exports = {
    registerPlayer,
    loginPlayer,
    updatePlayerStats,
    getPlayerRankings,
    getPlayerStats,
    isValidUsername
}; 