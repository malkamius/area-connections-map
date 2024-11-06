// index.js
const fs = require('fs');
const path = require('path');

class Vector {
    constructor(x, y) {
        this.x = Number.isFinite(x) ? x : 0;
        this.y = Number.isFinite(y) ? y : 0;
    }

    add(v) {
        return new Vector(this.x + v.x, this.y + v.y);
    }

    subtract(v) {
        return new Vector(this.x - v.x, this.y - v.y);
    }

    multiply(scalar) {
        const s = Number.isFinite(scalar) ? scalar : 0;
        return new Vector(this.x * s, this.y * s);
    }

    magnitude() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    normalize() {
        const mag = this.magnitude();
        return mag === 0 ? new Vector(0, 0) : new Vector(this.x / mag, this.y / mag);
    }

    validate() {
        if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) {
            console.error('Invalid vector:', this);
            return new Vector(0, 0);
        }
        return this;
    }
}

function getDirectionVector(direction) {
    switch(direction.toLowerCase()) {
        case 'east': return new Vector(1, 0);
        case 'west': return new Vector(-1, 0);
        case 'north': return new Vector(0, -1);
        case 'south': return new Vector(0, 1);
        case 'up': return new Vector(1, -1).normalize();
        case 'down': return new Vector(-1, 1).normalize();
        default: return new Vector(0, 0);
    }
}

function findDirectionalConnections(areas) {
    const connections = [];
    areas.forEach((sourceArea, sourceAreaIndex) => {
        sourceArea.rooms.forEach(sourceRoom => {
            Object.entries(sourceRoom.exits).forEach(([direction, targetId]) => {
                if (targetId) {
                    const targetAreaIndex = areas.findIndex(targetArea => 
                        targetArea.rooms.some(r => r.id === targetId)
                    );
                    if (targetAreaIndex !== -1 && sourceAreaIndex !== targetAreaIndex) {
                        connections.push({
                            source: sourceAreaIndex,
                            target: targetAreaIndex,
                            direction: direction
                        });
                    }
                }
            });
        });
    });

    // Deduplicate connections while preserving direction information
    return connections.filter((conn, index) => {
        const reverse = connections.findIndex(c => 
            c.source === conn.target && c.target === conn.source
        );
        return reverse === -1 || index < reverse;
    });
}

class ForceDirectedGraph {
    constructor(areas, connections, width, height) {
        this.width = width;
        this.height = height;
        
        // Initialize areas with random positions
        this.areas = areas.map(area => ({
            ...area,
            size: 30 + 30 * Math.max(0, Math.min(1, 1 - (100 / (area.rooms.length)))),
            pos: new Vector(
                width/2 + (Math.random() - 0.5) * width/4,
                height/2 + (Math.random() - 0.5) * height/4
            ),
            velocity: new Vector(0, 0),
            force: new Vector(0, 0)
        }));
        this.connections = connections;
    }

    applyForces() {
        const repulsionForce = 5000;
        const springForce = 0.01;
        const springLength = 200;
        const damping = 0.95;
        const directionBias = 2.0; // Strength of directional positioning

        // Reset forces
        this.areas.forEach(area => {
            area.force = new Vector(0, 0);
        });

        // Apply repulsion between all areas
        for (let i = 0; i < this.areas.length; i++) {
            for (let j = i + 1; j < this.areas.length; j++) {
                const area1 = this.areas[i];
                const area2 = this.areas[j];
                const delta = area2.pos.subtract(area1.pos);
                const distance = Math.max(delta.magnitude(), 1);
                const minDistance = area1.size + area2.size + 20;

                if (distance < minDistance) {
                    const force = delta.normalize().multiply(repulsionForce / (distance * distance));
                    area2.force = area2.force.add(force).validate();
                    area1.force = area1.force.add(force.multiply(-1)).validate();
                }
            }
        }

        // Apply directional spring forces for connections
        this.connections.forEach(conn => {
            const source = this.areas[conn.source];
            const target = this.areas[conn.target];
            const delta = target.pos.subtract(source.pos);
            const distance = Math.max(delta.magnitude(), 1);

            // Get the ideal direction vector based on the exit direction
            const idealDirection = getDirectionVector(conn.direction);
            
            // Calculate the ideal position for the target area
            const idealDistance = springLength;
            const idealPosition = source.pos.add(idealDirection.multiply(idealDistance));
            
            // Create a force that pulls the target area toward its ideal position
            const directionalForce = idealPosition.subtract(target.pos).multiply(springForce * directionBias);
            target.force = target.force.add(directionalForce).validate();
            
            // Apply a weaker opposing force to the source area
            source.force = source.force.add(directionalForce.multiply(-0.5)).validate();

            // Apply regular spring force (weaker than the directional force)
            const springF = delta.normalize().multiply((distance - springLength) * springForce * 0.5);
            source.force = source.force.add(springF).validate();
            target.force = target.force.add(springF.multiply(-1)).validate();
        });

        // Update velocities and positions
        this.areas.forEach(area => {
            area.velocity = area.velocity.add(area.force).multiply(damping).validate();
            area.pos = area.pos.add(area.velocity).validate();

            // Keep within bounds
            area.pos.x = Math.max(area.size, Math.min(this.width - area.size, area.pos.x));
            area.pos.y = Math.max(area.size, Math.min(this.height - area.size, area.pos.y));
        });
    }

    simulate(iterations = 100) {
        for (let i = 0; i < iterations; i++) {
            this.applyForces();
        }
        return this.areas;
    }
}



function findConnections(areas) {
    const connections = [];
    areas.forEach((area, sourceAreaIndex) => {
        area.rooms.forEach(room => {
            Object.entries(room.exits).forEach(([direction, targetId]) => {
                if (targetId) {
                    const targetAreaIndex = areas.findIndex(a => 
                        a.rooms.some(r => r.id === targetId)
                    );
                    if (targetAreaIndex !== -1 && sourceAreaIndex !== targetAreaIndex) {
                        connections.push({
                            source: sourceAreaIndex,
                            target: targetAreaIndex
                        });
                    }
                }
            });
        });
    });

    return connections.filter((conn, index) => {
        const reverse = connections.findIndex(c => 
            c.source === conn.target && c.target === conn.source
        );
        return reverse === -1 || index < reverse;
    });
}

// Modified generateHTML function to show directional connections
function generateHTML(areasData) {
    const width = 5000;
    const height = 5000;
    const areas = areasData.areas.map(area => ({
        ...area,
        size: 30 + 30 * Math.max(0, Math.min(1, 1 - (100 / (area.rooms.length))))
    }));
    
    console.log('Processing areas:', areas.length);
    const connections = findDirectionalConnections(areas);
    console.log('Found connections:', connections.length);
    
    const graph = new ForceDirectedGraph(areas, connections, width, height);
    const layoutedAreas = graph.simulate();

    // Generate SVG content
    const svgContent = `
        <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
            <defs>
                <marker 
                    id="arrowhead" 
                    markerWidth="10" 
                    markerHeight="7" 
                    refX="9" 
                    refY="3.5" 
                    orient="auto"
                >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
                </marker>
            </defs>
            
            ${connections.map((conn, index) => {
                const source = layoutedAreas[conn.source];
                const target = layoutedAreas[conn.target];
                if (!source?.pos || !target?.pos) return '';
                
                const isBidirectional = connections.some(c => 
                    c.source === conn.target && c.target === conn.source
                );

                const dx = target.pos.x - source.pos.x;
                const dy = target.pos.y - source.pos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (!Number.isFinite(distance)) return '';

                const midX = (source.pos.x + target.pos.x) / 2;
                const midY = (source.pos.y + target.pos.y) / 2;
                const normalX = distance ? (-dy / distance * 50) : 0;
                const normalY = distance ? (dx / distance * 50) : 0;

                const path1 = `M ${source.pos.x} ${source.pos.y} Q ${midX + normalX} ${midY + normalY} ${target.pos.x} ${target.pos.y}`;
                const path2 = `M ${target.pos.x} ${target.pos.y} Q ${midX - normalX} ${midY - normalY} ${source.pos.x} ${source.pos.y}`;

                return `
                    <path 
                        d="${path1}" 
                        fill="none" 
                        stroke="#666" 
                        stroke-width="2" 
                        marker-end="url(#arrowhead)" 
                    />
                    ${isBidirectional ? `
                        <path 
                            d="${path2}" 
                            fill="none" 
                            stroke="#666" 
                            stroke-width="2" 
                            marker-end="url(#arrowhead)" 
                        />
                    ` : ''}
                `;
            }).join('\n')}
            
            ${layoutedAreas.map((area, index) => `
                <g>
                    <circle 
                        cx="${area.pos.x}" 
                        cy="${area.pos.y}" 
                        r="${area.size}" 
                        fill="#e2e8f0" 
                        stroke="#64748b" 
                        stroke-width="2" 
                    />
                    <text 
                        x="${area.pos.x}" 
                        y="${area.pos.y}" 
                        text-anchor="middle" 
                        dominant-baseline="middle" 
                        font-family="Arial" 
                        font-size="${Math.min(area.size / 4, 14)}px"
                    >
                        ${area.name}
                    </text>
                </g>
            `).join('\n')}
        </svg>
    `;

    // Generate complete HTML
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Game World Map</title>
            <style>
                body {
                    margin: 0;
                    padding: 20px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    background-color: #f8fafc;
                    font-family: Arial, sans-serif;
                }
                .card {
                    background: white;
                    border-radius: 8px;
                    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
                    padding: 20px;
                    max-width: 900px;
                    width: 100%;
                }
                .card-title {
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 20px;
                    color: #1e293b;
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="card-title">Game World Map</div>
                ${svgContent}
            </div>
        </body>
        </html>
    `;
}

function loadAreasData(filePath) {
    try {
        const data = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading areas file:', error);
        process.exit(1);
    }
}


function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Please provide the path to areas.json');
        process.exit(1);
    }

    const inputPath = args[0];
    const outputPath = path.join(path.dirname(inputPath), 'world-map.html');

    const areasData = loadAreasData(inputPath);
    const htmlContent = generateHTML(areasData);

    try {
        fs.writeFileSync(outputPath, htmlContent);
        console.log(`Map generated successfully: ${outputPath}`);
    } catch (error) {
        console.error('Error writing output file:', error);
        process.exit(1);
    }
}

main();