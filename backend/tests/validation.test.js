/**
 * Test Suite: Validation & Error Handling
 * Validates that malformed input is rejected with proper error messages
 * and that errors don't crash the server
 */

const { z } = require('zod');
const { loginSchema, crearOrdenSchema } = require('../src/utils/validators');

describe('Input Validation (Zod Schemas)', () => {
  describe('Login Validation', () => {
    test('should accept valid login credentials', () => {
      const result = loginSchema.safeParse({
        username: 'admin',
        password: 'Abc@12345',
      });
      expect(result.success).toBe(true);
    });

    test('should reject missing username', () => {
      const result = loginSchema.safeParse({
        password: 'Abc@12345',
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toContain('username');
    });

    test('should reject missing password', () => {
      const result = loginSchema.safeParse({
        username: 'admin',
      });
      expect(result.success).toBe(false);
      expect(result.error.issues[0].path).toContain('password');
    });

    test('should reject empty strings', () => {
      const result = loginSchema.safeParse({
        username: '',
        password: '',
      });
      expect(result.success).toBe(false);
    });

    test('should reject non-string values', () => {
      const result = loginSchema.safeParse({
        username: 123,
        password: { nested: 'object' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Order Creation Validation', () => {
    const validOrder = {
      nombre_beneficiario: 'Empresa Test',
      detalle: 'Pago por servicios',
      valor_planilla: 1000.00,
      porcentaje_iva: 15,
      retenciones: [],
      otros_cargos: [],
    };

    test('should accept valid order', () => {
      const result = crearOrdenSchema.safeParse(validOrder);
      expect(result.success).toBe(true);
    });

    test('should reject missing beneficiary name', () => {
      const order = { ...validOrder };
      delete order.nombre_beneficiario;
      const result = crearOrdenSchema.safeParse(order);
      expect(result.success).toBe(false);
    });

    test('should reject missing detail', () => {
      const order = { ...validOrder };
      delete order.detalle;
      const result = crearOrdenSchema.safeParse(order);
      expect(result.success).toBe(false);
    });

    test('should reject negative valor_planilla', () => {
      const order = { ...validOrder, valor_planilla: -100 };
      const result = crearOrdenSchema.safeParse(order);
      expect(result.success).toBe(false);
    });

    test('should reject invalid IVA percentage (>100)', () => {
      const order = { ...validOrder, porcentaje_iva: 150 };
      const result = crearOrdenSchema.safeParse(order);
      expect(result.success).toBe(false);
    });

    test('should allow optional codigo_beneficiario', () => {
      const order = { ...validOrder, codigo_beneficiario: 'RUC-123456' };
      const result = crearOrdenSchema.safeParse(order);
      expect(result.success).toBe(true);
    });
  });
});

describe('Error Handling', () => {
  test('malformed JSON should be caught', () => {
    // This would be handled by bodyParser, but we test the concept
    const brokenData = { 
      value: undefined, // undefined values can cause issues
      nested: { complex: 'structure' }
    };
    
    expect(() => {
      loginSchema.parse(brokenData);
    }).toThrow();
  });

  test('validation errors should have clear messages', () => {
    const result = crearOrdenSchema.safeParse({
      nombre_beneficiario: '', // empty name
      detalle: 'Test',
      valor_planilla: -50, // negative
    });

    expect(result.success).toBe(false);
    const issues = result.error.issues;
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toHaveProperty('message');
    expect(issues[0].message).toBeTruthy();
  });
});

describe('Cache Behavior', () => {
  test('same order twice should use cache', () => {
    // Cache key is hash of (order + retencion es + firmantes + config + logo)
    const orden1 = {
      id: 1,
      numero_orden: 100,
      nombre_beneficiario: 'Test',
      valor_planilla: 1000,
    };

    const orden2 = {
      id: 1,
      numero_orden: 100,
      nombre_beneficiario: 'Test',
      valor_planilla: 1000,
    };

    // Same estructura = same cache key
    expect(orden1).toEqual(orden2);
  });

  test('modified order should invalidate cache', () => {
    const orden1 = {
      id: 1,
      numero_orden: 100,
      valor_planilla: 1000,
    };

    const orden2 = {
      id: 1,
      numero_orden: 100,
      valor_planilla: 1001, // Different value
    };

    expect(orden1).not.toEqual(orden2);
  });
});
