# Strapp

MVP local Preact + TypeScript pour préparer les bandes de Strappal.

## Démarrer

```sh
npm install
npm run dev
```

Ouvrir l’adresse indiquée par Vite (par défaut http://localhost:5173).

`npm run build` vérifie TypeScript et produit `dist/`. `npm test` vérifie le calcul de découpe.

## Synology / Container Manager

Le déploiement utilise Nginx et les fichiers statiques compilés. Adresse locale : `http://nas.local:8090`.

Depuis le poste de développement :

```sh
npm ci
npm run build
npm test
scp -O -r dist deploy david@nas.local:/volume1/docker/strappapp/
ssh david@nas.local 'cd /volume1/docker/strappapp && sudo /usr/local/bin/docker compose -p strappapp -f deploy/compose.yaml up -d'
```

Le dossier `/volume1/docker/strappapp` doit exister avant la première copie. `-O` utilise le protocole SCP classique compatible avec les chemins des volumes Synology. Le conteneur `strappapp` redémarre automatiquement avec Docker. Les fichiers du site et la configuration Nginx sont montés en lecture seule. Après une modification de `deploy/nginx.conf`, redémarrer uniquement ce service avec `docker compose -p strappapp -f deploy/compose.yaml restart strappapp` depuis ce même dossier (sur Synology, utiliser `sudo /usr/local/bin/docker`).

Le NAS héberge l’application, pas les protocoles : ils restent dans chaque navigateur, associés à l’adresse utilisée. Pour passer de localhost à l’adresse du NAS, exporter le protocole depuis l’ancienne adresse puis l’importer sur la nouvelle. Ce déploiement ne configure ni accès Internet ni redirection de ports du routeur.

## Fonctionnement

Le protocole et le matériel sont sauvegardés dans le stockage local du navigateur. Export/import JSON pour sauvegarder ou transférer les données. Les exemples initiaux ne sont pas des recommandations de soin.

La largeur du rouleau et la largeur commune de toutes les bandes se règlent dans « Ton matériel ». Le nombre global de séances à préparer multiplie le protocole entier. Chaque bande conserve uniquement son nom, sa longueur et son côté. Les anciens protocoles sont convertis en reprenant la largeur de leur première bande ; un message signale les anciennes largeurs différentes. Une copie de l’ancien format local est conservée sous `strapp-protocol-before-global-settings` lorsque le stockage le permet. Les exports utilisent les champs globaux `bandWidth` et `sessions`. Les anciennes quantités identiques deviennent le nombre de séances ; si elles diffèrent, le nombre est fixé à 1 avec un message explicatif.

Les bandes de même longueur sont regroupées, par largeur décroissante, en rangées de largeur égale au rouleau. Les rangées ayant les mêmes largeurs sont réunies dans un tronçon continu, dans la limite de la longueur de la plaque. Les coupes longitudinales traversent alors plusieurs rangées ; les coupes transversales séparent ensuite les différentes longueurs. Leur estimation suppose de conserver les bandes côte à côte pendant la coupe. Placement en colonnes contiguës sur la plaque, sans rotation ni superposition. Ce calcul heuristique ne garantit pas un minimum global de coupes. Les schémas sont proportionnels, pas des gabarits imprimables à taille réelle.

L’ordre des lignes définit l’enroulage. Chaque séance inclut une bande par côté sélectionné pour chaque ligne. Deux séances préparent deux jeux complets. Le guide présente une étape à la fois, à valider par bouton, Espace ou Entrée. Un mode permet de valider chaque paire ensemble ou la gauche puis la droite séparément, séance par séance. Une transition entre deux séances demande de préparer un autre mandrin, puis remet son aperçu à vide. Le mandrin animé indique la dernière bande de chaque côté. On peut annuler la dernière validation ou recommencer. La progression reste en mémoire pendant la navigation entre les onglets, mais est réinitialisée au rechargement et à toute modification du protocole. Aucune donnée du protocole n’est envoyée à un serveur. Pas encore de service worker ni d’installation hors connexion.

## Recherche de coupes communes

Le moteur compare jusqu’à 72 variantes : ordre des rangées, regroupement en tronçons, placement en colonnes ou en rangées, avec ou sans décalage. Il fusionne les segments de coupe colinéaires qui se touchent, sans traverser d’espace ni l’intérieur d’une bande. Le classement privilégie le nombre total de gestes (séparation des tronçons du rouleau comprise), puis le nombre de passages, le nombre de tronçons à manipuler et le déplacement à vide du cutter sur la plaque. La consommation de rouleau et les chutes sont identiques entre ces variantes.

Les colonnes peuvent être déplacées d’un nombre entier de centimètres pour aligner leurs séparations. Chaque tronçon et l’ordre de ses bandes restent continus : aucun espace n’est ajouté à l’intérieur. Pour un agencement fixé, une programmation dynamique maximise les séparations communes entre colonnes adjacentes ; les égalités privilégient les petits décalages. La recherche explore tous les décalages possibles jusqu’à 256 cm de marge, puis seulement les 257 premiers, l’extrémité et la position initiale. Elle est ignorée au-delà de 300 tronçons par passage ou 64 colonnes. Le quadrillage conserve un carreau par centimètre et renforce les lignes tous les 5 cm, dans les deux orientations.

Chaque passage présente les coupes partagées numérotées. Leur parcours regroupe les orientations et choisit les extrémités proches ; il suppose un départ au coin supérieur gauche et le maintien de tous les morceaux à leur place jusqu’à la fin. Les déplacements lors de la préparation des tronçons ne sont pas modélisés. La recherche est heuristique : ni le placement global ni le parcours ne sont garantis optimaux. Les bandes restent parallèles au rouleau, sans rotation ni superposition.
