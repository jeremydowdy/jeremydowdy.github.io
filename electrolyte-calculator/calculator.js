// ---------------------------------------------------------------
// Electrolyte calculator. Self-contained and scoped to #electrolyte.
//
// Batch-first: the batch is sized by the bag of sugar, and each
// bottle is a single scoop of the finished mix (weighing 0.2 g of
// KCl for one bottle isn't practical, so there's no per-ingredient
// single-dose recipe).
// ---------------------------------------------------------------
(function () {
    var root = document.getElementById('electrolyte');
    if (!root) return;

    var KCL_K = 0.5245;        // potassium fraction of KCl (39.098 / 74.55)
    var G_PER_LB = 453.592;
    var MIX_G_PER_TBSP = 12.5; // level tablespoon of the (mostly sugar) mix
    var FLAVORS = {
        none:       { g: 0,   c: 0 },
        strawberry: { g: 2.5, c: 80 },
        blackberry: { g: 2.5, c: 75 },
        lemon:      { g: 3.0, c: 85 },
        lime:       { g: 3.0, c: 85 }
    };

    var $ = function (id) { return document.getElementById('el-' + id); };
    var num = function (id) { var v = parseFloat($(id).value); return isFinite(v) && v >= 0 ? v : 0; };
    var presets = root.querySelectorAll('.el-pre');

    function grams(g) {
        return (g >= 100 ? Math.round(g).toLocaleString() : g.toFixed(1)) + ' g';
    }

    // Rounds to the nearest half tablespoon: 6.5 -> "6½"
    function tbsp(g) {
        var t = Math.round((g / MIX_G_PER_TBSP) * 2) / 2;
        var whole = Math.floor(t), half = t - whole > 0;
        return (whole || !half ? whole : '') + (half ? '½' : '');
    }

    function row(label, val, cls) {
        return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + label + '</td><td class="num">' + val + '</td></tr>';
    }

    function syncPresets() {
        Array.prototype.forEach.call(presets, function (btn) {
            var on = +btn.dataset.c === num('carbs') && +btn.dataset.na === num('na') && +btn.dataset.k === num('k');
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function calc() {
        var carbs = num('carbs'), na = num('na'), k = num('k');
        var naFrac = parseFloat($('src').value);

        var flavor = $('flavor').value;
        var fl = flavor === 'custom' ? { g: num('fg'), c: Math.min(num('fc'), 100) } : FLAVORS[flavor];
        $('customFlavor').hidden = flavor !== 'custom';
        $('flavorNote').hidden = flavor === 'none' || flavor === 'custom';

        // Per bottle
        var flavorG = fl.g;
        var flavorCarbs = flavorG * fl.c / 100;
        var sugar = Math.max(0, carbs - flavorCarbs);
        var scG = (na / 1000) / naFrac;
        var kclG = (k / 1000) / KCL_K;
        var scoopG = sugar + scG + kclG + flavorG;
        var totalCarbs = sugar + flavorCarbs;
        var kcal = Math.round(totalCarbs * 4);   // salts add no calories

        $('summary').textContent = 'Each bottle: ' + Math.round(totalCarbs) + ' g carbs (' + kcal + ' kcal), ' +
            Math.round(na) + ' mg sodium, ' + Math.round(k) + ' mg potassium.';

        // Batch, sized by the bag of sugar
        var unit = $('unit').value, b = num('batch');
        var bagG = unit === 'lb' ? b * G_PER_LB : b * 1000;
        var bottles = sugar > 0 ? bagG / sugar : 0;
        var total = bottles * scoopG;
        var bagLabel = (+b.toFixed(2)) + ' ' + unit;

        if (bottles <= 0) {
            $('batchRows').innerHTML = '';
            $('scoop').innerHTML = '<p class="el-scoop-sub">Enter a bag size and some carbs to get a recipe.</p>';
            return;
        }

        $('batchRows').innerHTML =
            row('Table sugar', bagLabel) +
            row('Sodium citrate', grams(bottles * scG)) +
            row('Potassium chloride (KCl)', grams(bottles * kclG)) +
            (flavorG > 0 ? row('Flavor powder', grams(bottles * flavorG)) : '') +
            row('Finished mix', (total / (unit === 'lb' ? G_PER_LB : 1000)).toFixed(2) + ' ' + unit, 'el-total');

        $('scoop').innerHTML =
            '<p class="el-scoop-main">Scoop <strong>' + Math.round(scoopG) + ' g</strong> per bottle</p>' +
            '<p class="el-scoop-sub">About ' + tbsp(scoopG) + ' level tablespoons. Makes about ' + Math.floor(bottles) + ' bottles.</p>';
    }

    Array.prototype.forEach.call(presets, function (btn) {
        btn.addEventListener('click', function () {
            $('carbs').value = btn.dataset.c;
            $('na').value = btn.dataset.na;
            $('k').value = btn.dataset.k;
            syncPresets();
            calc();
        });
    });

    // Keep the same amount of sugar when switching lb <-> kg
    $('unit').addEventListener('change', function () {
        var b = num('batch');
        $('batch').value = +(this.value === 'kg' ? b * G_PER_LB / 1000 : b * 1000 / G_PER_LB).toFixed(2);
    });

    Array.prototype.forEach.call(root.querySelectorAll('input, select'), function (el) {
        el.addEventListener('input', function () { syncPresets(); calc(); });
        el.addEventListener('change', calc);
    });

    syncPresets();
    calc();
})();
