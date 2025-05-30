const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

// Connexion à la base de données
const db = new sqlite3.Database(path.join(__dirname, 'tictactoe.db'), (err) => {
    if (err) {
        console.error('Erreur de connexion à la base de données:', err);
    } else {
        console.log('Connecté à la base de données SQLite');
        populateDatabase();
    }
});

// Fonction de hachage du mot de passe (identique à database.js)
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    return { hash, salt };
}

// Liste des joueurs à ajouter
const players = [
    {
        username: 'ProGamer123',
        password: 'test123',
        total_games: 150,
        wins: 120,
        draws: 15,
        losses: 15
    },
    {
        username: 'TicTacMaster',
        password: 'master456',
        total_games: 200,
        wins: 140,
        draws: 30,
        losses: 30
    },
    {
        username: 'CasualPlayer',
        password: 'casual789',
        total_games: 50,
        wins: 20,
        draws: 15,
        losses: 15
    },
    {
        username: 'GameKing',
        password: 'king123',
        total_games: 300,
        wins: 200,
        draws: 50,
        losses: 50
    },
    {
        username: 'Strategist',
        password: 'strat456',
        total_games: 180,
        wins: 130,
        draws: 25,
        losses: 25
    },
    {
        username: 'Newbie42',
        password: 'newb789',
        total_games: 20,
        wins: 5,
        draws: 5,
        losses: 10
    },
    {
        username: 'ChampionX',
        password: 'champ123',
        total_games: 250,
        wins: 190,
        draws: 35,
        losses: 25
    },
    {
        username: 'LuckyPlayer',
        password: 'lucky456',
        total_games: 100,
        wins: 45,
        draws: 30,
        losses: 25
    },
    {
        username: 'TicTacPro',
        password: 'pro789',
        total_games: 400,
        wins: 320,
        draws: 40,
        losses: 40
    },
    {
        username: 'GrandMaster',
        password: 'grand123',
        total_games: 500,
        wins: 425,
        draws: 50,
        losses: 25
    }
];

// Fonction pour peupler la base de données
function populateDatabase() {
    // Supprime d'abord tous les joueurs existants
    db.run('DELETE FROM players', [], (err) => {
        if (err) {
            console.error('Erreur lors de la suppression des données:', err);
            return;
        }
        console.log('Anciennes données supprimées');

        // Ajoute les nouveaux joueurs
        players.forEach(player => {
            const { hash, salt } = hashPassword(player.password);
            
            db.run(
                'INSERT INTO players (username, password_hash, password_salt, total_games, wins, draws, losses) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [player.username, hash, salt, player.total_games, player.wins, player.draws, player.losses],
                function(err) {
                    if (err) {
                        console.error('Erreur lors de l\'insertion du joueur:', player.username, err);
                    } else {
                        console.log('Joueur ajouté:', player.username);
                    }
                }
            );
        });
    });
}

// Ferme la connexion après un délai pour permettre l'insertion
setTimeout(() => {
    db.close((err) => {
        if (err) {
            console.error('Erreur lors de la fermeture de la base de données:', err);
        } else {
            console.log('Connexion à la base de données fermée');
        }
    });
}, 2000); 