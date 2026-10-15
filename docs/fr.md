# Bosch HomeCom Easy

## Présentation

Cette intégration amène dans Gladys les appareils Bosch de votre compte **HomeCom Easy**, via le cloud Bosch (celui
qu'utilise l'appli) :

- les **pompes à chaleur et chaudières** reliées à un **Connect-Key K 30 RF / K 40 RF** (Compress 5800i, 6800i,
  chaudières Condens…) ou à un module **ICOM** (Compress 7000i / 7001i AW) : température extérieure, températures
  de départ et de retour, pression de l'installation, état du générateur, défauts, et pour chaque circuit de
  chauffage la température ambiante, la consigne ambiante et le mode de fonctionnement ; l'eau chaude sanitaire avec
  sa température, sa consigne, son mode et la charge ponctuelle ;
- les **climatiseurs Climate** (3000i, 5000i, 6000i) : marche/arrêt, mode, consigne, vitesse de ventilation,
  température ambiante.

Elle lit le cloud toutes les quelques minutes et envoie vos commandes aussitôt, dans les limites que l'appareil
annonce.

> **Développée sans le matériel** : cette intégration a été écrite à partir du travail public de la communauté (voir
> « Limites » et les crédits du README) et testée sur des réponses enregistrées, pas sur un appareil réel. Vos
> retours sont les bienvenus, sur le forum Gladys ou dans les issues GitHub.

Cette intégration n'est ni affiliée à Bosch, ni approuvée par Bosch. Elle est distincte de l'intégration **Bosch
Smart Home** (Smart Home Controller), qui couvre d'autres produits.

## Prérequis

- Gladys **5.1.0** ou plus récent.
- Un compte **HomeCom Easy** (SingleKey ID) où votre appareil est déjà installé et fonctionne dans l'appli. Les
  appareils Buderus de l'appli **MyDevice** fonctionnent de la même façon : choisissez « Buderus MyDevice » comme
  marque de l'appli.
- Un ordinateur avec un navigateur doté d'outils de développement (Chrome, Edge, Firefox), pour la connexion unique.
- Gladys doit accéder à Internet (`singlekey-id.com` et `pointt-api.bosch-thermotechnology.com`).

## Configuration

Bosch ne propose pas de connexion publique pour les logiciels tiers : l'intégration utilise la connexion de l'appli,
qui se termine sur une adresse que seule l'appli sait ouvrir. Vous copiez un code à la main, une seule fois.

1. Dans **Intégrations → Bosch HomeCom Easy → Configuration**, choisissez la **marque de l'appli** et enregistrez.
2. Cliquez sur **Se connecter** à côté de « Compte Bosch (SingleKey ID) » : la page de connexion Bosch s'ouvre dans
   un nouvel onglet.
3. Dans cet onglet, appuyez sur **F12** pour ouvrir les outils de développement et choisissez l'onglet **Réseau**.
   Identifiez-vous ensuite avec l'adresse e-mail et le mot de passe de votre SingleKey ID.
4. La dernière page ne s'ouvre pas (le navigateur ne sait pas ouvrir `com.bosch.tt.dashtt.pointt://…`) : c'est
   normal. Dans l'onglet Réseau, repérez la requête dont l'adresse contient `code=` et copiez la valeur après
   `code=` (elle finit par `-1`). Copier l'adresse entière fonctionne aussi.
5. Collez-la dans **Code d'autorisation** et **enregistrez dans la minute** : le code expire vite et ne sert qu'une
   fois.

L'état passe à « connecté » et les appareils apparaissent dans l'onglet **Découverte** : ajoutez ceux que vous
voulez.

Votre mot de passe ne passe jamais par Gladys. L'intégration garde un **jeton de rafraîchissement** dans son volume
privé (`/data`) et le renouvelle seule : vous ne vous reconnectez que si Bosch le révoque (changement de mot de
passe, déconnexion de toutes les sessions…). L'état le signale alors.

Autres réglages :

- **Intervalle de rafraîchissement** : fréquence de lecture du cloud, 5 minutes par défaut, 2 minutes minimum.
- **Langue des noms d'appareils** : les noms écrits quand vous ajoutez un appareil (français par défaut).
- **Tester la connexion** : liste les appareils du compte, pris en charge ou non.

## Appareils

Chaque installation donne plusieurs appareils Gladys, pour placer chaque circuit dans sa pièce. Seules les valeurs
que votre appareil remonte sont créées.

### Générateur de chaleur

La pompe à chaleur ou la chaudière : température extérieure, températures de départ et de retour, pression de
l'installation (bar), état du générateur (chauffage, eau chaude, hors-gel, au repos), consommation totale (kWh,
ICOM seulement) et codes de défaut actifs (« Aucun défaut » sinon).

### Circuit de chauffage

Un appareil par circuit (hc1, hc2…) : température ambiante (si une sonde ou un thermostat d'ambiance est installé),
humidité (si disponible), **consigne ambiante** et **mode de fonctionnement** (programme, manuel, arrêt — les modes
que le circuit propose). La consigne est limitée à la plage annoncée par l'appareil (5–30 °C le plus souvent) et
arrondie au demi-degré. En rafraîchissement, c'est la consigne de rafraîchissement qui change.

### Eau chaude

Un appareil par circuit d'eau chaude : température de l'eau, **consigne**, **mode** (arrêt, éco, confort, programme
personnel…, selon l'appareil) et **charge d'eau chaude**, une charge ponctuelle que vous lancez ou arrêtez. La
consigne modifie la température du niveau en cours (confort, éco…) ; elle ne peut pas changer quand l'eau chaude est
à l'arrêt.

### Climatiseur

Marche/arrêt, mode (auto, froid, chaud, déshumidification, ventilation), consigne (16–30 °C le plus souvent),
vitesse de ventilation et température ambiante.

## Widget

**Chauffage et eau chaude** affiche sur le tableau de bord la température et la consigne ambiantes du premier
circuit, les températures de l'eau chaude et extérieure, les modes de chauffage et d'eau chaude, ce que fait le
générateur et les défauts, avec un bouton **Charge d'eau**. Dans ses réglages, choisissez n'importe quel appareil
d'une installation pour afficher celle-ci (utile avec plusieurs passerelles) ; vide, la première est affichée.

## Déclencheur de scène

**Défaut Bosch signalé** lance une scène quand un appareil signale un **nouveau** code de défaut. Choisissez le
générateur de chaleur ou le climatiseur, ou laissez vide pour n'importe lequel. La variable **Code de défaut**
contient le code (par exemple `A01-5`), à mettre dans une notification. Les défauts déjà présents à la connexion ne
lancent pas la scène, et un défaut ne la lance qu'une fois, pas à chaque lecture.

Les températures, modes et consignes sont des fonctionnalités d'appareils : utilisez-les dans les déclencheurs et
conditions « valeur d'un appareil » habituels de l'éditeur de scènes.

## Exemples de scènes

- **Alerte défaut** : déclencheur « Défaut Bosch signalé » → envoyer le message « Défaut pompe à chaleur
  {{triggerEvent.data.code}} » à la famille.
- **Eau chaude sur surplus solaire** : quand la production solaire dépasse 2 kW, mettre « Charge d'eau chaude » de
  l'appareil eau chaude à marche.
- **Absence** : quand tout le monde part, mettre la consigne ambiante à 17 °C ; au retour de la première personne,
  à 20 °C.
- **Soirée d'été** : à 19 h, si le salon dépasse 27 °C, allumer le climatiseur en mode froid à 25 °C.

## Dépannage

- **« Ce code ne vient pas du bouton Se connecter »** : le code a été obtenu ailleurs (par exemple avec un autre
  outil). Cliquez sur **Se connecter** dans cette intégration, reconnectez-vous et collez le nouveau code.
- **« Bosch a refusé le code »** : le code a déjà servi, a expiré (il vit environ une minute) ou a été copié en
  partie. Cliquez à nouveau sur **Se connecter** ; collez la valeur juste après `code=`, jusqu'au `&` s'il y en a un.
- **Aucune requête avec `code=`** : ouvrez les outils de développement **avant** de vous identifier, dans l'onglet de
  la page de connexion. Sous Chrome, cochez « Conserver le journal » dans l'onglet Réseau.
- **« La connexion Bosch a expiré »** : Bosch a révoqué le jeton de rafraîchissement. Reconnectez-vous comme indiqué
  dans Configuration.
- **« Le cloud Bosch ne répond pas »** : panne d'Internet ou de Bosch ; l'intégration réessaie à chaque
  rafraîchissement et signale le retour. Les appareils restent listés.
- **Un appareil manque** : lancez **Tester la connexion**. Un appareil listé « non pris en charge » (chauffe-eau
  `wddw2`, thermostat `rrc2`, borne de recharge, climatiseur Matter…) n'est pas encore couvert.
- **Une commande est refusée** : la valeur sort de la plage annoncée par l'appareil, ou le mode n'est pas proposé
  par cet appareil. Les journaux de l'intégration disent pourquoi (`LOG_LEVEL=debug` montre chaque lecture).

## Limites

- **Cloud uniquement** : pas d'accès local. Si le cloud Bosch ou la connexion Internet est en panne, rien n'est lu
  ni envoyé.
- **Quotas** : Bosch ne publie aucun quota pour cette API. L'intégration reste sobre : deux à trois requêtes par
  passerelle à chaque rafraîchissement (5 minutes par défaut, 2 minutes minimum), une requête par commande, et elle
  s'arrête dès que Bosch répond « trop de requêtes » ou refuse la connexion.
- **API non officielle** : c'est celle de l'appli HomeCom Easy, documentée par la communauté. Bosch peut la changer
  sans prévenir.
- **Délai** : une commande s'affiche aussitôt, mais le cloud peut mettre une minute à remonter la nouvelle valeur ;
  la lecture suivante la confirme ou la corrige.
- **K30/K40 en mode programme** : la consigne ambiante écrite est celle du mode manuel (comme dans l'intégration
  Home Assistant). Pour changer la température tout de suite, passez le circuit en manuel.
- Non couverts : programmes vacances et absence, plannings, ventilation, circuits solaires, piscines, historique
  d'énergie (compteurs journaliers et mensuels), chauffe-eau `wddw2`, thermostats `rrc2`, bornes de recharge, et
  climatiseurs mis en service via Matter.
- Les réglages qui pourraient être dangereux (courbes de chauffe, température de départ maximale, désinfection
  thermique) ne sont pas proposés.

## Données et vie privée

L'intégration garde dans son volume privé (`/data`) : le jeton de rafraîchissement de votre compte Bosch, le secret
PKCE de la dernière connexion en cours, la liste de vos appareils et les codes de défaut déjà signalés. Elle ne
garde ni ne journalise jamais votre mot de passe, vos jetons ou le code d'autorisation. Elle ne parle qu'à
`singlekey-id.com` et `pointt-api.bosch-thermotechnology.com`.
