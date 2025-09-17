import { DataTypes, Model, Sequelize } from 'sequelize';

export class User extends Model {
  public id!: number;
  public name!: string;
  public email!: string;
  public age?: number;
  public createdAt!: Date;
  public updatedAt!: Date;

  static initModel(sequelize: Sequelize): typeof User {
    User.init(
      {
        id: {
          type: DataTypes.INTEGER,
          autoIncrement: true,
          primaryKey: true,
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        email: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: true,
        },
        age: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: 'Users',
        timestamps: true,
      }
    );

    return User;
  }
}