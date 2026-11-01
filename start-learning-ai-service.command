#!/bin/zsh
cd /Users/brettmccausland/Documents/GitHub/ai-edu-service || exit 1
printf "Paste your OpenAI API key (it will not be saved): "
read -s OPENAI_API_KEY
printf "\n"
export OPENAI_API_KEY
npm start
