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

Adresse prévue : `https://flaykz.github.io/strappapp/`. Le workflow compile avec `npm run build -- --base=/strappapp/` pour charger les ressources sous le chemin du dépôt. `npm run build` conserve la racine `/` pour le NAS. Le déploiement Pages ne met pas à jour le NAS. Les données du navigateur ne sont pas transférées entre les deux adresses : utiliser l’export/import.

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

Les bandes sont placées dans l’ordre d’enroulage, séance par séance. Les bandes consécutives de même longueur peuvent partager un tronçon. Une marge de 1 cm sépare les tronçons parallèles, superposés en vue paysage. Les bandes issues d’un même tronçon restent côte à côte jusqu’à leur séparation. Chaque passage utilise la même plaque : découper puis enrouler les bandes disponibles avant de préparer le passage suivant. Si une paire est répartie entre deux passages, utiliser le guidage bande par bande. Les schémas sont proportionnels, pas des gabarits imprimables à taille réelle.

L’ordre des lignes définit l’enroulage. Chaque séance inclut une bande par côté sélectionné pour chaque ligne. Deux séances préparent deux jeux complets. Le guide présente une étape à la fois, à valider par bouton, Espace ou Entrée. Un mode permet de valider chaque paire ensemble ou la gauche puis la droite séparément, séance par séance. Une transition entre deux séances demande de préparer un autre mandrin, puis remet son aperçu à vide. Le mandrin animé indique la dernière bande de chaque côté. On peut annuler la dernière validation ou recommencer. La progression reste en mémoire pendant la navigation entre les onglets, mais est réinitialisée au rechargement et à toute modification du protocole. Aucune donnée du protocole n’est envoyée à un serveur. Pas encore de service worker ni d’installation hors connexion.

## Recherche de coupes communes

Les coupes colinéaires qui se touchent sont fusionnées. Leur parcours regroupe les orientations et choisit les extrémités proches ; il suppose un départ au coin supérieur gauche et le maintien de tous les morceaux à leur place jusqu’à la fin. Le placement suit l’ordre du protocole et ne garantit pas un minimum global de coupes ou de passages. Les bandes restent parallèles au rouleau, sans rotation ni superposition.

Le stock est conservé séparément sur cet appareil. Un type standard de 4 cm × 10 m est proposé ; on peut ajouter des types et saisir le reste de chaque rouleau. Chaque tronçon est attribué au rouleau compatible ayant le plus petit reste suffisant. Après toutes les découpes, la consommation peut être enregistrée en une fois ; les restes sont modifiables manuellement. Le suivi de confirmation de la préparation en cours est réinitialisé au rechargement : ne pas enregistrer deux fois la même préparation. Le stock ne fait pas partie de l’export du protocole.
