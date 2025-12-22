#!/bin/bash
echo "Starting We Five Server..."
echo "Access locally at: http://localhost:8080"
echo "Access on network at: http://10.211.56.227:8080"
python3 -m http.server 8080
