# Strapp

MVP local Preact + TypeScript pour préparer les bandes de Strappal.

## Démarrer

```sh
npm install
npm run dev
```

Ouvrir l’adresse indiquée par Vite (par défaut http://localhost:5173).

`npm run build` vérifie TypeScript et produit `dist/`. `npm test` vérifie le calcul de découpe.

## GitHub Pages

Le workflow `.github/workflows/pages.yml` teste et compile l’application puis la déploie sur GitHub Pages à chaque push sur `main`. Il peut aussi être lancé manuellement depuis l’onglet Actions. Dans Settings → Pages, choisir GitHub Actions comme source. Un dépôt privé nécessite une offre GitHub compatible avec Pages ; sinon, le dépôt doit être public.

Adresse prévue : `https://flaykz.github.io/strappapp/`. Le workflow compile avec `npm run build -- --base=/strappapp/` pour charger les ressources sous le chemin du dépôt.

## Fonctionnement

Le protocole et le matériel sont sauvegardés dans le stockage local du navigateur. Export/import JSON pour sauvegarder ou transférer les données. Les exemples initiaux ne sont pas des recommandations de soin.

La largeur du rouleau et la largeur commune de toutes les bandes se règlent dans « Ton matériel ». Le nombre global de séances à préparer multiplie le protocole entier. Chaque bande conserve uniquement son nom, sa longueur et son côté. Les anciens protocoles sont convertis en reprenant la largeur de leur première bande ; un message signale les anciennes largeurs différentes. Une copie de l’ancien format local est conservée sous `strapp-protocol-before-global-settings` lorsque le stockage le permet. Les exports utilisent les champs globaux `bandWidth` et `sessions`. Les anciennes quantités identiques deviennent le nombre de séances ; si elles diffèrent, le nombre est fixé à 1 avec un message explicatif.

Les bandes sont placées dans l’ordre d’enroulage, séance par séance. Les bandes consécutives de même longueur peuvent partager un tronçon. Une marge de 1 cm sépare les tronçons parallèles, superposés en vue paysage. Les bandes issues d’un même tronçon restent côte à côte jusqu’à leur séparation. Chaque passage utilise la même plaque : découper puis enrouler les bandes disponibles avant de préparer le passage suivant. Si une paire est répartie entre deux passages, utiliser le guidage bande par bande. Les schémas sont proportionnels, pas des gabarits imprimables à taille réelle.

L’ordre des lignes définit l’enroulage. Chaque séance inclut une bande par côté sélectionné pour chaque ligne. Deux séances préparent deux jeux complets. Le guide présente une étape à la fois, à valider par bouton, Espace ou Entrée. Un mode permet de valider chaque paire ensemble ou la gauche puis la droite séparément, séance par séance. Une transition entre deux séances demande de préparer un autre mandrin, puis remet son aperçu à vide. Le mandrin animé indique la dernière bande de chaque côté. On peut annuler la dernière validation ou recommencer. La progression reste en mémoire pendant la navigation entre les onglets, mais est réinitialisée au rechargement et à toute modification du protocole. Sans compte, aucune donnée du protocole n’est envoyée à un serveur (voir « Synchronisation »). Pas encore de service worker ni d’installation hors connexion.

## Recherche de coupes communes

Les coupes colinéaires qui se touchent sont fusionnées. Leur parcours regroupe les orientations et choisit les extrémités proches ; il suppose un départ au coin supérieur gauche et le maintien de tous les morceaux à leur place jusqu’à la fin. Le placement suit l’ordre du protocole et ne garantit pas un minimum global de coupes ou de passages. Les bandes restent parallèles au rouleau, sans rotation ni superposition.

Le stock est conservé séparément sur cet appareil. Un type standard de 4 cm × 10 m est proposé ; on peut ajouter des types et saisir le reste de chaque rouleau. Chaque tronçon est attribué au rouleau compatible ayant le plus petit reste suffisant. Après toutes les découpes, la consommation peut être enregistrée en une fois ; les restes sont modifiables manuellement. Le suivi de confirmation de la préparation en cours est réinitialisé au rechargement : ne pas enregistrer deux fois la même préparation. Le stock ne fait pas partie de l’export du protocole.

## Synchronisation

Optionnelle : l’app reste entièrement utilisable sans compte et hors ligne, le stockage local restant la source locale. Le panneau « Synchronisation » (onglet « Mon protocole ») permet de se connecter avec un email et un mot de passe ; il n’y a pas d’inscription, le compte est créé par l’administrateur du serveur PocketBase (`https://pb.flaykz.ovh`, surchargeable avec `VITE_PB_URL` au build). La session est conservée sur l’appareil : une connexion par appareil suffit.

Le protocole (même format que l’export JSON, stock exclu) est stocké dans la collection `protocols`, un enregistrement par utilisateur. Chaque modification locale met à jour un horodatage (`clientUpdatedAt`) et marque les changements « non envoyés » ; l’envoi est différé d’environ 1,5 s. À l’ouverture, au retour de focus et au retour de connexion, l’app compare les horodatages : la version la plus récente gagne. Un protocole distant est validé comme un import avant de remplacer le local. À la première connexion d’un appareil, la version en ligne la plus récente remplace les données locales ; celles-ci sont copiées au préalable dans `strapp-protocol-before-sync` (récupérable via la console du navigateur, ou un futur bouton). La copie n’est faite que si le local a des modifications non envoyées (ou n’a jamais été synchronisé) et diffère du distant ; une copie de moins de 24 h est conservée, sinon elle est remplacée (format `{ savedAt, protocol }`). Hors ligne ou en cas d’erreur réseau ou serveur, les modifications restent en attente et sont renvoyées automatiquement (reprise après 30 s, 1 min, 2 min, puis toutes les 5 min) ou dès le retour de focus. Si la session expire, le panneau repasse à « Non connecté » : les modifications restent en attente et partent après reconnexion. Les horloges des appareils font foi : une horloge très décalée peut fausser l’arbitrage.
