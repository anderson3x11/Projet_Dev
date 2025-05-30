# Tic Tac Toe Multijoueur avec Electron

Un jeu de Morpion multijoueur (ou contre IA) développé avec Electron, Node.js et WebSocket.

## Fonctionnalités

- Interface graphique moderne avec Electron
- Mode multijoueur en réseau local
- Mode solo contre un bot
- Système d'authentification
- Statistiques des joueurs
- Classement des meilleurs joueurs
- File d'attente pour les parties multijoueur
- Support du mode client-serveur ou client seul

## Prérequis

- Node.js (version 14 ou supérieure)
- npm (gestionnaire de paquets Node.js)

## Installation

1. Clonez le dépôt :
```bash
git clone https://github.com/anderson3x11/Projet_Dev.git
cd Projet_Dev
```

2. Installez les dépendances :
```bash
npm install
```

## Modes d'utilisation

### Mode Serveur + Client (tout-en-un)
Pour lancer l'application en mode serveur et client sur la même machine :
```bash
npm start
```

### Mode Client seul
Pour lancer uniquement le client (pour se connecter à un serveur distant) :
```bash
npm run client
```

### Mode Développement
Pour lancer l'application en mode développement avec les outils de développement :
```bash
npm run dev
```

### Mode Serveur seul
Pour lancer uniquement le serveur :
```bash
npm run server
```

## Structure du Projet

- `main.js` : Point d'entrée de l'application Electron
- `server.js` : Serveur WebSocket et API REST
- `database.js` : Gestion de la base de données SQLite
- `public/` : Contient les fichiers du client
  - `index.html` : Interface utilisateur
  - `style.css` : Styles de l'interface
  - `client.js` : Logique côté client

## Utilisation

1. Lancez l'application en mode serveur + client ou serveur seul sur une machine
2. Les autres joueurs peuvent se connecter en mode client en utilisant l'adresse IP du serveur
3. Créez un compte ou connectez-vous
4. Choisissez entre jouer contre un bot ou chercher une partie multijoueur
5. Pour le mode multijoueur :
   - Si un adversaire est disponible, la partie commence immédiatement
   - Sinon, vous serez placé dans une file d'attente

## Fonctionnalités de Jeu

- Système de tours alternés
- Statistiques en temps réel
- Affichage du classement
- Possibilité de continuer à jouer avec le même adversaire
- File d'attente pour les joueurs en attente de partie

## Base de Données

Le jeu utilise SQLite pour stocker :
- Les comptes utilisateurs
- Les statistiques des joueurs (parties jouées, victoires, défaites, matchs nuls)
- Le classement global

## Sécurité

- Mots de passe hashés avec sel
- Validation des noms d'utilisateur
- Protection contre les connexions multiples
- Gestion sécurisée des sessions WebSocket

## Dépannage

1. Problèmes de connexion :
   - Vérifiez que le port 8080 est ouvert sur le pare-feu
   - Assurez-vous d'utiliser la bonne adresse IP du serveur

2. Base de données :
   - Si la base de données est corrompue, supprimez le fichier `tictactoe.db`
   - Relancez le serveur pour recréer la base de données

3. Problèmes de client :
   - Vérifiez la connexion réseau
   - Assurez-vous que le serveur est en cours d'exécution
   - Essayez de redémarrer le client