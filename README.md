# Espaços latentes da COSc 2023

Ferramenta de visual analytics da dissertação *Interpretable Latent Space Analysis for Forest Species using Satellite Images* (MIACD, Universidade de Coimbra).

Mostra como as classes de floresta e matos da COSc 2023 (eucalipto, outras folhosas, pinheiro-bravo, matos) se organizam nos espaços latentes de seis *foundation models* de píxel (GeoTessera, AlphaEarth, Presto, OlmoEarth, Tessera v2, Galileo), no tile Sentinel-2 29TNE. Cada classe tem 2 000 píxeis puros (janela 3 × 3 da mesma classe) e 2 000 de borda, com um controlo para ver uns, outros ou todos; os píxeis que o mapa de *Acacia dealbata* da dissertação classifica como acácia ficam de fora (estão em [acacia-dealbata-latent-viewer](https://github.com/ficast/acacia-dealbata-latent-viewer)). A página tem:

- projeções UMAP e t-SNE ligadas a um mapa com o OrtoSat 2023 da DGT e o Sentinel-2 cloudless 2023 da EOX;
- pureza e confusão dos vizinhos mais próximos, calculadas no espaço original de cada modelo.

## Estrutura

Site estático, sem build:

| Ficheiro | Conteúdo |
|---|---|
| `index.html`, `style.css`, `app.js` | A página (Leaflet 1.9.4 via unpkg) |
| `data.json` | Píxeis, projeções e métricas, gerado pelo notebook 54 do workspace da tese (`project/notebooks/experimentos_8/54_cosc_six_models_app.ipynb`, exportado para `project/data/interim/acacia_final/latent/data_cosc_six_models.json`). A versão anterior, com três modelos e só píxeis puros, vinha do notebook 47 |

## Correr localmente

```
python -m http.server 8765
```

e abrir http://127.0.0.1:8765/ (o `fetch` do `data.json` não funciona a partir de `file://`).

## Deploy

Vercel, como site estático (sem *framework*, sem comando de build, diretório de saída a raiz).

## Créditos das imagens

- OrtoSat 2023 © Direção-Geral do Território (WMS `ortos.dgterritorio.gov.pt/wms/ortosat2023`).
- Sentinel-2 cloudless 2023 — https://s2maps.eu by EOX IT Services GmbH (contém dados Copernicus Sentinel modificados de 2023), CC BY-NC-SA 4.0.
