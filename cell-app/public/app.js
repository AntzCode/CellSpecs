let currentCell = {};
let currentStage = 0;
let isEditing = false;
let cells = [];
let selectedCells = [];
let currentSelectedIndex = -1;
let editMode = false;
let filterStage = 'all';

$(document).ready(function() {
    loadCells();
    $('#add-cell').click(function() {
        isEditing = false;
        showForm(0, {});
    });
    $('#toggle-edit-mode').click(function() {
        editMode = !editMode;
        $(this).text(editMode ? 'Exit Edit Mode' : 'Enter Edit Mode');
        $('#edit-selected').toggle(editMode);
        $('.cell-select').toggle(editMode);
    });
    $('#edit-selected').click(function() {
        const selected = [];
        $('.cell-select:checked').each(function() {
            selected.push($(this).closest('li').data('id'));
        });
        if (selected.length > 0) {
            selectedCells = selected;
            currentSelectedIndex = 0;
            editCell(selected[0]);
        } else {
            alert('No cells selected');
        }
    });
    $('#save-next').click(function() {
        saveCell(true);
    });
    $('#save').click(function() {
        saveCell(false);
    });
    $('#cancel').click(function() {
        hideForm();
    });
    $('#json-save').click(function() {
        saveJson();
    });
    $('#json-cancel').click(function() {
        $('#json-modal').hide();
    });
    $('#logout').click(function() {
        window.location.href = '/logout';
    });
    $('#stage-filter').change(function() {
        filterStage = $(this).val();
        displayCells(cells);
    });
    $(document).on('click', '.bracket-card', function() {
        $(this).find('.bracket-list').toggle();
    });
    $('#export-jsonl').click(function() {
        $.get('/api/cells', function(data) {
            const jsonl = data.map(cell => JSON.stringify(cell)).join('\n');
            const blob = new Blob([jsonl], { type: 'application/jsonl' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'cells.jsonl';
            a.click();
            URL.revokeObjectURL(url);
        });
    });
    $('#import-jsonl').click(function() {
        const file = $('#import-file')[0].files[0];
        if (!file) return alert('Select a file');
        const reader = new FileReader();
        reader.onload = function(e) {
            const lines = e.target.result.split('\n').filter(l => l.trim());
            let imported = 0;
            let errors = 0;
            lines.forEach(line => {
                try {
                    const cell = JSON.parse(line);
                    $.ajax({
                        url: '/api/cells',
                        type: 'POST',
                        contentType: 'application/json',
                        data: JSON.stringify(cell),
                        success: function() {
                            imported++;
                            if (imported + errors === lines.length) {
                                loadCells();
                                alert(`Import completed: ${imported} imported, ${errors} errors`);
                                $('#import-file').val('');
                            }
                        },
                        error: function() {
                            errors++;
                            if (imported + errors === lines.length) {
                                loadCells();
                                alert(`Import completed: ${imported} imported, ${errors} errors`);
                                $('#import-file').val('');
                            }
                        }
                    });
                } catch (err) {
                    console.error('Error parsing', line, err);
                    errors++;
                    if (imported + errors === lines.length) {
                        loadCells();
                        alert(`Import completed: ${imported} imported, ${errors} errors`);
                        $('#import-file').val('');
                    }
                }
            });
        };
        reader.readAsText(file);
    });
});

function loadCells() {
    $.get('/api/cells', function(data) {
        cells = data.sort((a, b) => parseInt(a.cellNumber) - parseInt(b.cellNumber));
        calculateStats(cells);
        displayCells(cells);
    });
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1);
    if (num >= 1000) return (num / 1000).toFixed(1);
    return num.toFixed(1);
}

function calculateStats(data) {
    const totalCells = data.length;
    const totalWh = data.reduce((sum, c) => sum + (parseFloat(c.capacityMwh) || 0), 0) * 1000;
    const withCapacity = data.filter(c => (c.stage || 0) >= 2).length;
    const capacityPercent = totalCells > 0 ? ((withCapacity / totalCells) * 100).toFixed(1) : 0;
    const cellsWithCapacity = data.filter(c => c.capacityMwh);
    const avgCapacityWh = cellsWithCapacity.length > 0 ? (totalWh / cellsWithCapacity.length) : 0;
    const forecastTotalWh = withCapacity > 0 ? (avgCapacityWh * totalCells) : totalWh;
    const irValues = data.map(c => parseFloat(c.internalResistance)).filter(v => !isNaN(v));
    const minIR = irValues.length > 0 ? Math.min(...irValues).toFixed(1) : 'N/A';
    const maxIR = irValues.length > 0 ? Math.max(...irValues).toFixed(1) : 'N/A';
    const avgIR = irValues.length > 0 ? (irValues.reduce((a, b) => a + b, 0) / irValues.length).toFixed(1) : 'N/A';

    // IR brackets
    const brackets = [
        { range: '0-30mΩ', min: 0, max: 30 },
        { range: '30-60mΩ', min: 30, max: 60 },
        { range: '60-100mΩ', min: 60, max: 100 },
        { range: '>100mΩ', min: 100, max: Infinity }
    ];
    const bracketStats = brackets.map(b => {
        const cellsInBracket = data.filter(c => {
            const ir = parseFloat(c.internalResistance);
            return !isNaN(ir) && ir >= b.min && ir < b.max;
        }).sort((a, b) => parseInt(a.cellNumber) - parseInt(b.cellNumber));
        const count = cellsInBracket.length;
        const wh = cellsInBracket.reduce((sum, c) => sum + (parseFloat(c.capacityMwh) || 0), 0) * 1000;
        const cellIds = cellsInBracket.map(c => c.cellNumber).join(', ');
        return {
            text: `${b.range}: ${count} cells, ${formatNumber(wh)} Wh`,
            list: cellIds
        };
    });

    $('#stats').html(`Total Cells: ${totalCells} | Total Wh: ${formatNumber(totalWh)} | Progress: ${capacityPercent}% | Avg Capacity: ${(avgCapacityWh/1000).toFixed(1)} mWh | Forecast Total: ${formatNumber(forecastTotalWh)} Wh | IR: Min ${minIR}, Max ${maxIR}, Avg ${avgIR}`);
    $('#bracket-stats').html(bracketStats.map((b, i) => `<div class="bracket-card" data-index="${i}"><div class="bracket-summary">${b.text}</div><div class="bracket-list" style="display:none;">${b.list}</div></div>`).join(''));
}

function displayCells(data) {
    const filtered = filterStage === 'all' ? data : data.filter(c => (c.stage || 0) == filterStage);
    $('#cell-list').empty();
    filtered.forEach(cell => {
        const rechargeDate = cell.rechargeDate ? new Date(cell.rechargeDate).toLocaleDateString() : 'N/A';
        const voltage7daysDate = cell.voltage7daysDate ? new Date(cell.voltage7daysDate).toLocaleDateString() : 'N/A';
        const voltageDrop = cell.voltageRecharge && cell.voltage7days ? (cell.voltageRecharge - cell.voltage7days).toFixed(3) : 'N/A';
        const dropPerMonth = voltageDrop !== 'N/A' ? (voltageDrop * 30 / 7).toFixed(3) : 'N/A';
        const details = `Voltage: ${cell.firstVoltage || 'N/A'}<br>IR: ${cell.internalResistance || 'N/A'}<br>Charge V: ${cell.firstChargeVoltage || 'N/A'}<br>Cap mAh: ${cell.capacityMah || 'N/A'}<br>Cap mWh: ${cell.capacityMwh || 'N/A'}<br>Flat V: ${cell.voltageFlat || 'N/A'}<br>Recharge V: ${cell.voltageRecharge || 'N/A'}<br>Recharge Date: ${rechargeDate}<br>7 Days V: ${cell.voltage7days || 'N/A'}<br>7 Days IR: ${cell.ir7days || 'N/A'}<br>7 Days Date: ${voltage7daysDate}<br>Voltage Drop: ${voltageDrop}<br>Drop/Month: ${dropPerMonth}`;
        let statusText = ['New', 'Testing', 'Charging', 'On hold', 'Tested'][cell.stage] || 'New';
        if (cell.stage === 3 && cell.rechargeDate) {
            const rechargeDateObj = new Date(cell.rechargeDate);
            if (!isNaN(rechargeDateObj.getTime())) {
                const now = new Date();
                const daysElapsed = (now - rechargeDateObj) / (1000 * 60 * 60 * 24);
                const daysLeft = Math.max(0, 7 - daysElapsed);
                statusText = `On hold (${daysLeft.toFixed(1)} days left)`;
            }
        }
        $('#cell-list').append(`<li data-id="${cell.cellNumber}"><div class="header"><input type="checkbox" class="cell-select" title="Select this cell for bulk editing"> <span class="cell-id">${cell.cellNumber}</span><span class="status">${statusText}</span></div><div class="buttons"><button class="view-details" title="Show detailed specifications for this cell">View Details</button> <button class="edit-json" title="Open a text editor for direct JSON editing of this cell's data">Edit JSON</button></div><div class="details" style="display:none;">${details}</div></li>`);
    });
    $('#cell-list li').click(function(e) {
        if ($(e.target).is('input, button')) return;
        if (editMode) {
            $(this).find('.cell-select').prop('checked', !$(this).find('.cell-select').prop('checked'));
        } else {
            const id = $(this).data('id');
            editCell(id);
        }
    });
    $('#cell-list .view-details').click(function(e) {
        e.stopPropagation();
        $(this).parent().next('.details').toggle();
    });
    $('#cell-list .edit-json').click(function(e) {
        e.stopPropagation();
        const id = $(this).closest('li').data('id');
        editJson(id);
    });
}

function showForm(stage, cell) {
    $('#form-container').show().toggleClass('editing', isEditing);
    $('#form-title').text(isEditing ? `Edit Cell ${cell.cellNumber}` : 'Add Cell');
    $('.stage').hide();
    $(`#stage-${stage}`).show();
    // Populate fields
    $('#cell-number').val(cell.cellNumber || '');
    $('#first-voltage').val(cell.firstVoltage || '');
    $('#internal-resistance').val(cell.internalResistance || '');
    $('#first-charge-voltage').val(cell.firstChargeVoltage || '');
    $('#capacity-mah').val(cell.capacityMah || '');
    $('#capacity-mwh').val(cell.capacityMwh || '');
    $('#voltage-flat').val(cell.voltageFlat || '');
    $('#voltage-recharge').val(cell.voltageRecharge || '');
    $('#voltage-7days').val(cell.voltage7days || '');
    $('#ir-7days').val(cell.ir7days || '');
    currentCell = cell;
    currentStage = stage;
    // Focus on first field
    $(`#stage-${stage} input:first`).focus();
    $('#cell-form input').off('keypress').on('keypress', function(e) {
        if (e.which === 13) { // Enter key
            const visibleInputs = $('#cell-form input:visible');
            const currentIndex = visibleInputs.index(this);
            if (currentIndex < visibleInputs.length - 1) {
                visibleInputs.eq(currentIndex + 1).focus();
            } else {
                $('#save-next').click();
            }
            e.preventDefault();
        }
    });
}

function saveCell(next) {
    const cellNumber = isEditing ? currentCell.cellNumber : $('#cell-number').val();
    if (!cellNumber) {
        alert('Cell number is required');
        return;
    }
    const cell = {
        cellNumber: cellNumber,
        firstVoltage: $('#first-voltage').val(),
        internalResistance: $('#internal-resistance').val(),
        firstChargeVoltage: $('#first-charge-voltage').val(),
        capacityMah: $('#capacity-mah').val(),
        capacityMwh: $('#capacity-mwh').val(),
        voltageFlat: $('#voltage-flat').val(),
        voltageRecharge: $('#voltage-recharge').val(),
        voltage7days: $('#voltage-7days').val(),
        ir7days: $('#ir-7days').val(),
        stage: currentStage,
        // status derived from stage
    };
    $.ajax({
        url: '/api/cells',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(cell),
        success: function() {
            loadCells();
            if (isEditing) {
                if (selectedCells.length > 0) {
                    // Editing selected cells
                    if (next) {
                        currentSelectedIndex++;
                        if (currentSelectedIndex < selectedCells.length) {
                            editCell(selectedCells[currentSelectedIndex]);
                        } else {
                            selectedCells = [];
                            currentSelectedIndex = -1;
                            hideForm();
                        }
                    } else {
                        // For selected, perhaps stay or next stage, but for simplicity, next stage
                        currentStage++;
                        if (currentStage > 4) {
                            currentSelectedIndex++;
                            if (currentSelectedIndex < selectedCells.length) {
                                editCell(selectedCells[currentSelectedIndex]);
                            } else {
                                selectedCells = [];
                                currentSelectedIndex = -1;
                                hideForm();
                            }
                        } else {
                            showForm(currentStage, cell);
                        }
                    }
                } else {
                    // Normal editing
                    if (next) {
                        const currentIndex = cells.findIndex(c => c.cellNumber == currentCell.cellNumber);
                        if (currentIndex < cells.length - 1) {
                            editCell(cells[currentIndex + 1].cellNumber);
                        } else {
                            hideForm();
                        }
                    } else {
                        currentStage++;
                        if (currentStage > 4) {
                            hideForm();
                        } else {
                            showForm(currentStage, cell);
                        }
                    }
                }
            } else {
                if (next) {
                    showForm(0, {});
                } else {
                    hideForm();
                }
            }
        }
    });
}

function editCell(id) {
    $.get(`/api/cells/${id}`, function(cell) {
        isEditing = true;
        let stage = (cell.stage || 0) + 1;
        if (stage > 4) stage = 4;
        showForm(stage, cell);
    });
}

function hideForm() {
    $('#form-container').hide();
}

function editJson(id) {
    $.get(`/api/cells/${id}`, function(cell) {
        $('#json-form').empty();
        for (const key in cell) {
            if (cell.hasOwnProperty(key)) {
                const value = cell[key] !== null && cell[key] !== undefined ? cell[key] : '';
                $('#json-form').append(`<div><label>${key}: <input type="text" name="${key}" value="${value}"></label></div>`);
            }
        }
        $('#json-modal').show();
    });
}

function saveJson() {
    const updated = {};
    $('#json-form input').each(function() {
        const key = $(this).attr('name');
        let value = $(this).val();
        // Try to parse as number if possible
        if (!isNaN(value) && value !== '') {
            value = parseFloat(value);
        }
        updated[key] = value;
    });
    $.ajax({
        url: '/api/cells',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(updated),
        success: function() {
            loadCells();
            $('#json-modal').hide();
        },
        error: function(xhr) {
            alert('Error saving: ' + xhr.responseText);
        }
    });
}