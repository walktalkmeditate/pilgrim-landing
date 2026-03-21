(function() {
  var container = document.querySelector('.goshuin-visual');
  if (!container) return;

  var walkData = {
    route: [
      {lat:42.8782,lon:-8.5448,alt:280},{lat:42.8810,lon:-8.5405,alt:310},
      {lat:42.8835,lon:-8.5380,alt:340},{lat:42.8860,lon:-8.5355,alt:370},
      {lat:42.8880,lon:-8.5330,alt:395},{lat:42.8895,lon:-8.5300,alt:410},
      {lat:42.8910,lon:-8.5270,alt:390},{lat:42.8930,lon:-8.5240,alt:365},
      {lat:42.8950,lon:-8.5210,alt:345},{lat:42.8970,lon:-8.5185,alt:330},
      {lat:42.8985,lon:-8.5160,alt:310},{lat:42.8806,lon:-8.5446,alt:235}
    ],
    distance: 8200,
    activeDuration: 6300,
    meditateDuration: 900,
    talkDuration: 480,
    startDate: '2026-03-20T07:00:00Z',
    mark: 'peaceful'
  };

  async function computeHash(data) {
    var parts = [];
    data.route.forEach(function(p) { parts.push(p.lat.toFixed(5)+','+p.lon.toFixed(5)); });
    parts.push(String(data.distance));
    parts.push(String(data.activeDuration));
    parts.push(String(data.meditateDuration));
    parts.push(String(data.talkDuration));
    parts.push(data.startDate);
    var encoded = new TextEncoder().encode(parts.join('|'));
    var hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    var hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray).map(function(b) { return b.toString(16).padStart(2,'0'); }).join('');
  }

  function hexToBytes(hex) {
    var bytes = new Uint8Array(hex.length / 2);
    for (var i = 0; i < hex.length; i += 2) bytes[i/2] = parseInt(hex.substring(i, i+2), 16);
    return bytes;
  }

  async function renderSeal() {
    var hash = await computeHash(walkData);
    var bytes = hexToBytes(hash);

    var size = 240;
    var cx = size / 2;
    var cy = size / 2;
    var outerR = size * 0.44;
    var rotation = (bytes[0] / 255) * 360;

    var coolColors = ['#7A8B6F', '#95A895', '#8BA09A', '#B8AFA2'];
    var sealColor = coolColors[bytes[30] % coolColors.length];

    var elements = [];

    var ringCount = 3 + (bytes[1] % 3);
    for (var i = 0; i < ringCount; i++) {
      var radOff = (bytes[2 + (i%6)] / 255) * 0.08;
      var r = outerR - i * (size * (0.04 + radOff * 0.02));
      if (r < size * 0.15) break;
      var db = bytes[6 + (i%6)];
      var dl = 2 + (db % 8), gl = 1 + ((db >> 4) % 6);
      var da = i === 0 ? '' : 'stroke-dasharray="'+dl+' '+gl+'"';
      var sw = i === 0 ? 1.5 : 0.8 + (bytes[i]%3)*0.3;
      var op = 0.7 - i * 0.06;
      elements.push('<circle cx="'+cx+'" cy="'+cy+'" r="'+r.toFixed(1)+'" fill="none" stroke="'+sealColor+'" stroke-width="'+sw.toFixed(1)+'" opacity="'+op.toFixed(2)+'" '+da+'/>');
    }

    var lineCount = 4 + (bytes[8] % 5);
    for (var i = 0; i < lineCount; i++) {
      var angle = ((bytes[8+(i%8)]/255)*360 + i*(360/lineCount)) % 360;
      var rad = angle * Math.PI / 180;
      var inner = 0.25 + (bytes[16+(i%4)]/255)*0.15;
      var outer = 0.85 + (bytes[20+(i%4)]/255)*0.15;
      var x1 = cx + Math.cos(rad)*outerR*inner;
      var y1 = cy + Math.sin(rad)*outerR*inner;
      var x2 = cx + Math.cos(rad)*outerR*outer;
      var y2 = cy + Math.sin(rad)*outerR*outer;
      var sw = 0.5 + (bytes[i]%3)*0.3;
      var op = 0.3 + (bytes[i+12]/255)*0.3;
      elements.push('<line x1="'+x1.toFixed(1)+'" y1="'+y1.toFixed(1)+'" x2="'+x2.toFixed(1)+'" y2="'+y2.toFixed(1)+'" stroke="'+sealColor+'" stroke-width="'+sw.toFixed(1)+'" opacity="'+op.toFixed(2)+'" stroke-linecap="round"/>');
    }

    var dotCount = 3 + (bytes[28] % 5);
    for (var i = 0; i < dotCount; i++) {
      var angle = (bytes[28+(i%4)]/255)*360 + i*47;
      var rad = angle * Math.PI / 180;
      var dist = outerR * (0.3 + (bytes[29+(i%3)]/255)*0.5);
      var x = cx + Math.cos(rad)*dist;
      var y = cy + Math.sin(rad)*dist;
      var dr = 1 + (bytes[i]%2);
      elements.push('<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="'+dr+'" fill="'+sealColor+'" opacity="0.35"/>');
    }

    var alts = walkData.route.map(function(p){return p.alt;});
    var minA = Math.min.apply(null, alts), maxA = Math.max.apply(null, alts);
    var altRange = Math.max(maxA - minA, 1);
    var maxOff = size * 0.03;
    var elevPts = [];
    var step = (2*Math.PI) / walkData.route.length;
    for (var i = 0; i < walkData.route.length; i++) {
      var norm = (alts[i]-minA)/altRange;
      var er = outerR*0.75 + (norm-0.5)*maxOff*2;
      var ea = step*i - Math.PI/2;
      elevPts.push((cx+Math.cos(ea)*er).toFixed(1)+','+(cy+Math.sin(ea)*er).toFixed(1));
    }
    elements.push('<polygon points="'+elevPts.join(' ')+'" fill="none" stroke="'+sealColor+'" stroke-width="0.8" opacity="0.5"/>');

    var arcR = outerR - size*0.08;
    var topArc = 'M '+(cx-arcR)+','+cy+' A '+arcR+','+arcR+' 0 0,1 '+(cx+arcR)+','+cy;
    var bottomArc = 'M '+(cx+arcR)+','+(cy+size*0.06)+' A '+arcR+','+arcR+' 0 0,1 '+(cx-arcR)+','+(cy+size*0.06);

    var distKm = (walkData.distance/1000).toFixed(1);

    var svg = '<svg width="'+size+'" height="'+size+'" viewBox="0 0 '+size+' '+size+'" style="max-width:100%">';
    svg += '<defs><filter id="seal-rough"><feTurbulence type="turbulence" baseFrequency="0.04" numOctaves="3" seed="'+bytes[31]+'"/>';
    svg += '<feDisplacementMap in="SourceGraphic" scale="1.5"/></filter></defs>';
    svg += '<g transform="rotate('+rotation.toFixed(1)+' '+cx+' '+cy+')" filter="url(#seal-rough)">';
    svg += elements.join('\n');
    svg += '</g>';
    svg += '<g transform="rotate('+rotation.toFixed(1)+' '+cx+' '+cy+'">';
    svg += '<path id="seal-top" d="'+topArc+'" fill="none"/>';
    svg += '<text font-family="Lato, sans-serif" font-size="'+size*0.048+'" fill="'+sealColor+'" letter-spacing="3" opacity="0.7">';
    svg += '<textPath href="#seal-top" startOffset="50%" text-anchor="middle" style="text-transform:uppercase">PILGRIM \u00B7 SPRING 2026</textPath></text>';
    svg += '<path id="seal-bottom" d="'+bottomArc+'" fill="none"/>';
    svg += '<text font-family="Lato, sans-serif" font-size="'+size*0.048+'" fill="'+sealColor+'" letter-spacing="3" opacity="0.7">';
    svg += '<textPath href="#seal-bottom" startOffset="50%" text-anchor="middle" style="text-transform:uppercase">MORNING WALK</textPath></text>';
    svg += '</g>';
    svg += '<text x="'+cx+'" y="'+(cy-size*0.02)+'" text-anchor="middle" font-family="Cormorant Garamond, serif" font-size="'+size*0.17+'" font-weight="300" fill="'+sealColor+'" opacity="0.7">'+distKm+'</text>';
    svg += '<text x="'+cx+'" y="'+(cy+size*0.1)+'" text-anchor="middle" font-family="Lato, sans-serif" font-size="'+size*0.05+'" fill="#B8AFA2" letter-spacing="2">KM</text>';
    svg += '</svg>';

    svg += '<p class="seal-hash" style="font-family:Lato,sans-serif;font-size:0.625rem;color:#B8AFA2;opacity:0.5;margin-top:1rem;word-break:break-all;max-width:240px;text-align:center">SHA-256: '+hash.substring(0,16)+'\u2026</p>';

    container.innerHTML = svg;
  }

  renderSeal();
})();
