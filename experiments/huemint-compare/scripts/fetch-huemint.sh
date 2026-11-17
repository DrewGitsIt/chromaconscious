#!/usr/bin/env bash
# usage: fetch-huemint.sh <outdir>; polite: sequential, 2s gap
set -eu
out=$1
M='["0","10","80","55","45","35","10","0","90","65","45","45","80","90","0","0","0","0","55","65","0","0","35","65","45","45","0","35","0","35","35","45","0","65","35","0"]'
req() { # name mode n palette
  curl -sS -m 90 -X POST https://api.huemint.com/color -H 'Content-Type: application/json; charset=utf-8' -A 'palette-research-client' \
    -d "{\"mode\":\"$2\",\"num_colors\":6,\"temperature\":\"1.2\",\"num_results\":$3,\"adjacency\":$M,\"palette\":$4}" -o "$out/$1.json" -w "$1 %{http_code} %{time_total}s\n"
  sleep 2
}
req free-transformer transformer 50 '["-","#ffffff","-","-","-","-"]'
req free-diffusion diffusion 5 '["-","#ffffff","-","-","-","-"]'
for b in 1f6feb e63946 2a9d8f f4a261 6a4c93 606c38 ff5c1f 0f172a; do
  req "b$b-transformer" transformer 50 "[\"-\",\"#ffffff\",\"-\",\"#$b\",\"-\",\"-\"]"
  req "b$b-diffusion" diffusion 5 "[\"-\",\"#ffffff\",\"-\",\"#$b\",\"-\",\"-\"]"
done
