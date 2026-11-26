# PocketBase (backend de synchronisation Strapp)

- Domaine : https://pb.flaykz.ovh (admin : https://pb.flaykz.ovh/_/), VPS perso, Coolify (projet `pocketbase`, service `j9rujntiqvc1wbbjze45ldqx`).
- Image épinglée : `ghcr.io/muchobien/pocketbase:0.40.6` (PocketBase 0.40.6). Données dans le volume Docker `pb_data` (`/pb_data`).
- CORS : `--origins=https://flaykz.github.io,http://localhost:5173`.
- Compte superuser : généré côté serveur, fichier `/root/pocketbase-superuser` (600 root) sur le VPS. Le lire : `ssh flaykz@vps-perso 'sudo cat /root/pocketbase-superuser'` (variables `PB_EMAIL` / `PB_PASSWORD`).
- Inscription publique désactivée (`users.createRule = null`). Créer un compte utilisateur : se connecter à l'admin avec le superuser, collection `users` > New record (email, mot de passe, `verified` coché).
- Collection `protocols` : un protocole par utilisateur (index unique sur `owner`), schéma dans `protocols.collection.json`.
- Sauvegardes : automatiques PocketBase, cron `0 3 * * *`, 7 conservées (Admin > Settings > Backups, stockées dans `pb_data/backups`, même volume : pas une sauvegarde hors serveur).
