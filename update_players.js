const axios = require('axios');

async function updatePlayerCount(count) {
    try {
        await axios.post('http://localhost:3000/update-players', {
            playerCount: count
        });
        console.log(`Zaktualizowano graczy: ${count}`);
    } catch (err) {
        console.error("Nie udało się zaktualizować:", err.message);
    }
}

// Przykład użycia:
updatePlayerCount(69); // <- tu wpisz ile jest graczy
