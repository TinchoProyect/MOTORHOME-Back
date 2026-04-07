

async function test() {
    const samples = [];
    for (let i = 0; i < 280; i++) {
        samples.push(`MARCA PRUEBA ITEM ${i} ${Math.random()}`);
    }

    try {
        const payload = {
            column_name: "MARCA",
            prompt: "Extraer marca comercial",
            samples: samples
        };

        const res = await fetch(" http://localhost:5655/api/ai/discover-entities\, {method:\POST\, headers:{\Content-Type\:\application/json\}, body:JSON.stringify(payload)}); const data = await res.json(); console.log(\SUCCESS:\, data); return;
        console.log("SUCCESS:");
        console.log(res.data);
    } catch (e) {
        console.error("FAIL:", e.response ? e.response.status : e.message);
        if (e.response && e.response.data) {
            console.error("Data:", e.response.data);
        }
    }
}

test();
