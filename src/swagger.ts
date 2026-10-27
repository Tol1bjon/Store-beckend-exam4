export const swaggerDocument = {
  openapi: "3.0.1",
  info: {
    title: "Custom Store API (React TS Project)",
    version: "2.0.0",
    description: "Улучшенная версия Store API: с поддержкой Google OAuth, JSON + Query совместимостью, необязательными картинками при PUT и модулем Заказов (Orders)."
  },
  servers: [{ url: "https://store-beckend-exam4.onrender.com", description: "Cloud Server" }],
  components: {
    securitySchemes: {
      Bearer: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Вставь сюда только сам JWT токен (без слова Bearer)"
      }
    },
    schemas: {
      RegisterDto: {
        type: "object",
        required: ["userName", "email", "password", "confirmPassword"],
        properties: {
          userName: { type: "string", example: "student_tj" },
          phoneNumber: { type: "string", example: "+992900000000" },
          email: { type: "string", example: "student@gmail.com" },
          password: { type: "string", example: "123456" },
          confirmPassword: { type: "string", example: "123456" }
        }
      },
      LoginDto: {
        type: "object",
        required: ["userName", "password"],
        properties: {
          userName: { type: "string", example: "student_tj" },
          password: { type: "string", example: "123456" }
        }
      },
      GoogleAuthDto: {
        type: "object",
        description: "Передай либо idToken от @react-oauth/google, либо данные профиля Google",
        properties: {
          credential: { type: "string", description: "JWT credential от Google Login" },
          email: { type: "string", example: "user@gmail.com" },
          name: { type: "string", example: "Ali Valiev" },
          picture: { type: "string", example: "https://lh3.googleusercontent.com/..." },
          googleId: { type: "string", example: "10987654321" }
        }
      }
    }
  },
  security: [{ Bearer: [] }],
  paths: {
    "/Account/register": {
      post: {
        tags: ["Account"],
        summary: "Регистрация нового пользователя",
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/RegisterDto" } } }
        },
        responses: { "200": { description: "Success" } }
      }
    },
    "/Account/login": {
      post: {
        tags: ["Account"],
        summary: "Вход по логину и паролю (возвращает JWT)",
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/LoginDto" } } }
        },
        responses: { "200": { description: "Success" } }
      }
    },
    "/Account/google": {
      post: {
        tags: ["Account"],
        summary: "🔥 НОВОЕ: Вход и Регистрация через Google",
        requestBody: {
          content: { "application/json": { schema: { $ref: "#/components/schemas/GoogleAuthDto" } } }
        },
        responses: { "200": { description: "Возвращает JWT токен" } }
      }
    },
    "/Brand/get-brands": {
      get: {
        tags: ["Brand"],
        parameters: [
          { name: "BrandName", in: "query", schema: { type: "string" } },
          { name: "PageNumber", in: "query", schema: { type: "integer" } },
          { name: "PageSize", in: "query", schema: { type: "integer" } }
        ],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Brand/add-brand": {
      post: {
        tags: ["Brand"],
        summary: "Принимает и Query (?BrandName=...), и JSON body { brandName }",
        parameters: [{ name: "BrandName", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Brand/update-brand": {
      put: {
        tags: ["Brand"],
        parameters: [
          { name: "Id", in: "query", required: true, schema: { type: "integer" } },
          { name: "BrandName", in: "query", required: true, schema: { type: "string" } }
        ],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Brand/delete-brand": {
      delete: {
        tags: ["Brand"],
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Color/get-colors": {
      get: {
        tags: ["Color"],
        parameters: [{ name: "ColorName", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Color/add-color": {
      post: {
        tags: ["Color"],
        parameters: [{ name: "ColorName", in: "query", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Color/update-color": {
      put: {
        tags: ["Color"],
        parameters: [
          { name: "Id", in: "query", required: true, schema: { type: "integer" } },
          { name: "ColorName", in: "query", required: true, schema: { type: "string" } }
        ],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Color/delete-color": {
      delete: {
        tags: ["Color"],
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Category/get-categories": {
      get: { tags: ["Category"], responses: { "200": { description: "Success" } } }
    },
    "/Category/get-category-by-id": {
      get: {
        tags: ["Category"],
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Category/add-category": {
      post: {
        tags: ["Category"],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["CategoryName"],
                properties: {
                  CategoryName: { type: "string" },
                  CategoryImage: { type: "string", format: "binary" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Success" } }
      }
    },
    "/Category/update-category": {
      put: {
        tags: ["Category"],
        summary: "Картинка теперь НЕ обязательна при обновлении!",
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["Id", "CategoryName"],
                properties: {
                  Id: { type: "integer" },
                  CategoryName: { type: "string" },
                  CategoryImage: { type: "string", format: "binary" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Success" } }
      }
    },
    "/Category/delete-category": {
      delete: {
        tags: ["Category"],
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/SubCategory/get-sub-category": {
      get: { tags: ["SubCategory"], responses: { "200": { description: "Success" } } }
    },
    "/SubCategory/add-sub-category": {
      post: {
        tags: ["SubCategory"],
        parameters: [
          { name: "CategoryId", in: "query", required: true, schema: { type: "integer" } },
          { name: "SubCategoryName", in: "query", required: true, schema: { type: "string" } }
        ],
        responses: { "200": { description: "Success" } }
      }
    },
    "/SubCategory/update-sub-category": {
      put: {
        tags: ["SubCategory"],
        parameters: [
          { name: "Id", in: "query", required: true, schema: { type: "integer" } },
          { name: "CategoryId", in: "query", required: true, schema: { type: "integer" } },
          { name: "SubCategoryName", in: "query", required: true, schema: { type: "string" } }
        ],
        responses: { "200": { description: "Success" } }
      }
    },
    "/SubCategory/delete-sub-category": {
      delete: {
        tags: ["SubCategory"],
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Product/get-products": {
      get: {
        tags: ["Product"],
        parameters: [
          { name: "ProductName", in: "query", schema: { type: "string" } },
          { name: "MinPrice", in: "query", schema: { type: "number" } },
          { name: "MaxPrice", in: "query", schema: { type: "number" } },
          { name: "BrandId", in: "query", schema: { type: "integer" } },
          { name: "ColorId", in: "query", schema: { type: "integer" } },
          { name: "CategoryId", in: "query", schema: { type: "integer" } },
          { name: "SubcategoryId", in: "query", schema: { type: "integer" } },
          { name: "PageNumber", in: "query", schema: { type: "integer" } },
          { name: "PageSize", in: "query", schema: { type: "integer" } }
        ],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Product/get-product-by-id": {
      get: {
        tags: ["Product"],
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Product/add-product": {
      post: {
        tags: ["Product"],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["ProductName", "Price", "BrandId", "ColorId", "SubCategoryId"],
                properties: {
                  Images: { type: "array", items: { type: "string", format: "binary" } },
                  ProductName: { type: "string" },
                  Description: { type: "string" },
                  Quantity: { type: "integer" },
                  Code: { type: "string" },
                  Price: { type: "number" },
                  HasDiscount: { type: "boolean" },
                  DiscountPrice: { type: "number" },
                  BrandId: { type: "integer" },
                  ColorId: { type: "integer" },
                  SubCategoryId: { type: "integer" },
                  Weight: { type: "string" },
                  Size: { type: "string" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Success" } }
      }
    },
    "/Product/update-product": {
      put: {
        tags: ["Product"],
        summary: "Поддерживает и JSON Body, и Query параметры!",
        parameters: [
          { name: "Id", in: "query", required: true, schema: { type: "integer" } },
          { name: "ProductName", in: "query", schema: { type: "string" } },
          { name: "Description", in: "query", schema: { type: "string" } },
          { name: "Quantity", in: "query", schema: { type: "integer" } },
          { name: "Price", in: "query", schema: { type: "number" } },
          { name: "HasDiscount", in: "query", schema: { type: "boolean" } },
          { name: "DiscountPrice", in: "query", schema: { type: "number" } },
          { name: "BrandId", in: "query", schema: { type: "integer" } },
          { name: "ColorId", in: "query", schema: { type: "integer" } },
          { name: "SubCategoryId", in: "query", schema: { type: "integer" } }
        ],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Product/delete-product": {
      delete: {
        tags: ["Product"],
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Cart/get-products-from-cart": {
      get: { tags: ["Cart"], responses: { "200": { description: "Success" } } }
    },
    "/Cart/add-product-to-cart": {
      post: {
        tags: ["Cart"],
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Cart/increase-product-in-cart": {
      put: {
        tags: ["Cart"],
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Cart/reduce-product-in-cart": {
      put: {
        tags: ["Cart"],
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Cart/delete-product-from-cart": {
      delete: {
        tags: ["Cart"],
        parameters: [{ name: "id", in: "query", required: true, schema: { type: "integer" } }],
        responses: { "200": { description: "Success" } }
      }
    },
    "/Cart/clear-cart": {
      delete: { tags: ["Cart"], responses: { "200": { description: "Success" } } }
    },
    "/Order/checkout": {
      post: {
        tags: ["Order (НОВОЕ)"],
        summary: "Оформление заказа и автоматическая очистка корзины",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  address: { type: "string", example: "Душанбе, пр. Рудаки 100" },
                  phone: { type: "string", example: "+992900112233" }
                }
              }
            }
          }
        },
        responses: { "200": { description: "Success" } }
      }
    }
  }
};
