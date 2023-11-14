#!/bin/bash

FETCH_URL="https://fm.bill.tt/status"
POST_URL="http://local.bill.tt:3000/"

while true; do
    # Fetch content from FETCH_URL
    content=$(curl -s "$FETCH_URL")

    # Check if the fetch was successful
    if [ $? -eq 0 ]; then
        # Post the fetched content to POST_URL
        curl -X POST -H 'Content-Type: application/json' -d "$content" "$POST_URL"
    else
        echo "Failed to fetch content from $FETCH_URL"
    fi

    # Wait for 3 seconds before repeating
    sleep 3
done
