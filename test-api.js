fetch('http://localhost:3000/api/namefind', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: 'ancient light sovereign', type: 'vibe' })
})
.then(res => res.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error('Error:', err.message));
