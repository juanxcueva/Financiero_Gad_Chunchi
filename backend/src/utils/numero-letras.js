/**
 * Convierte un número a su representación en letras (español)
 * Ej: 27.82 → "VEINTE Y SIETE con 82/100 dólares"
 */
function numeroALetras(num) {
  const unidades = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const especiales = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE'];
  const decenas = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const centenas = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  if (num === 0) return 'CERO con 00/100 dólares';

  const partes = Math.abs(num).toFixed(2).split('.');
  const entero = parseInt(partes[0]);
  const decimal = partes[1];

  function convertirGrupo(n) {
    if (n === 0) return '';
    if (n === 100) return 'CIEN';

    let resultado = '';

    if (n >= 100) {
      resultado += centenas[Math.floor(n / 100)] + ' ';
      n = n % 100;
    }

    if (n >= 10 && n <= 15) {
      resultado += especiales[n - 10];
      return resultado.trim();
    }

    if (n >= 16 && n <= 19) {
      resultado += 'DIECI' + unidades[n - 10];
      return resultado.trim();
    }

    if (n >= 21 && n <= 29) {
      resultado += 'VEINTI' + unidades[n - 20];
      return resultado.trim();
    }

    if (n >= 10) {
      resultado += decenas[Math.floor(n / 10)];
      n = n % 10;
      if (n > 0) resultado += ' Y ';
    }

    if (n > 0) {
      resultado += unidades[n];
    }

    return resultado.trim();
  }

  let texto = '';

  if (entero === 0) {
    texto = 'CERO';
  } else if (entero === 1) {
    texto = 'UN';
  } else if (entero < 1000) {
    texto = convertirGrupo(entero);
  } else if (entero < 1000000) {
    const miles = Math.floor(entero / 1000);
    const resto = entero % 1000;
    if (miles === 1) {
      texto = 'MIL';
    } else {
      texto = convertirGrupo(miles) + ' MIL';
    }
    if (resto > 0) {
      texto += ' ' + convertirGrupo(resto);
    }
  } else {
    const millones = Math.floor(entero / 1000000);
    const resto = entero % 1000000;
    if (millones === 1) {
      texto = 'UN MILLÓN';
    } else {
      texto = convertirGrupo(millones) + ' MILLONES';
    }
    if (resto > 0) {
      const miles = Math.floor(resto / 1000);
      const unid = resto % 1000;
      if (miles > 0) {
        texto += (miles === 1 ? ' MIL' : ' ' + convertirGrupo(miles) + ' MIL');
      }
      if (unid > 0) {
        texto += ' ' + convertirGrupo(unid);
      }
    }
  }

  return `${texto} con ${decimal}/100 dólares`;
}

module.exports = { numeroALetras };
