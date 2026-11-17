"""Rehearse a populated legacy upgrade, including an independent restore before cutover."""
import json
import shutil

def verify(source, run, pg, node, env, url, sql, check, call, configuration_v2=False):
    upgrade = "ordersawa_upgrade_fixture"
    recovery = "ordersawa_upgrade_recovery"
    sql("postgres", "CREATE DATABASE " + upgrade)
    check(upgrade)
    schema = source / "apps/api/prisma/schema.prisma"
    root = run / "upgrade-prisma"
    migrations = root / "migrations"
    migrations.mkdir(parents=True)
    shutil.copyfile(schema, root / "schema.prisma")
    shutil.copyfile(schema.parent / "migrations/migration_lock.toml", migrations / "migration_lock.toml")
    history = sorted(p for p in (schema.parent / "migrations").iterdir() if p.is_dir())
    def deploy(batch):
        for p in batch:
            shutil.copytree(p, migrations / p.name)
        call(node, source / "node_modules/prisma/build/index.js", "migrate", "deploy",
             "--schema", root / "schema.prisma", env={**env, "DATABASE_URL":url(upgrade),"DIRECT_URL":url(upgrade)})
    deploy(history[:1])
    sql(upgrade, """
    INSERT INTO "Restaurant"(id,name,slug,"updatedAt") VALUES ('r1','Fixture A','r1',now()),('r2','Fixture B','r2',now());
    INSERT INTO "Category"(id,"restaurantId",name,slug) VALUES ('c1','r1','Menu','menu'),('c2','r2','Menu','menu');
    INSERT INTO "Product"(id,"restaurantId","categoryId",name,slug,"basePrice",currency,"updatedAt")
        VALUES ('pizza','r1','c1','Pizza','pizza',12.50,'USD',now()),('side','r1','c1','Side','side',1,'USD',now()),('foreign','r2','c2','Pizza','pizza',2000,'SYP',now());
    INSERT INTO "Order"(id,"restaurantId","totalAmount",currency,status) VALUES ('o1','r1',12.50,'USD','PENDING_WHATSAPP');
    INSERT INTO "OrderItem"(id,"orderId","productId",name,quantity,"unitPrice","totalPrice") VALUES ('l1','o1','pizza','Pizza',1,12.50,12.50);
    INSERT INTO "MediaAsset"(id,"restaurantId",url,type,"updatedAt") VALUES ('m1','r1','https://example.invalid/model.glb','MODEL_3D',now());
    """)
    snapshot = """SELECT p.id,p."restaurantId",p."categoryId",p."basePrice"::numeric(12,2),p.currency FROM "Product" p ORDER BY p.id;
    SELECT o.id, i.id, i."productId",o."totalAmount"::numeric(12,2) FROM "Order" o JOIN "OrderItem" i ON o.id=i."orderId";"""
    before = sql(upgrade,snapshot)
    archive = run / "legacy-upgrade.dump"
    call(pg/"pg_dump","-Fc","-f",archive,upgrade)
    split = next(i+1 for i,p in enumerate(history) if p.name.endswith("_product_configuration_network"))
    deploy(history[1:split])
    if not configuration_v2:
        sql(upgrade, """
        UPDATE "Product" SET "configurationVersion"=1,
          "configurationTree"='{"schemaVersion":1,"productId":"pizza","revision":1,"basePrice":"12.50","groups":[]}' WHERE id='pizza';
        INSERT INTO "ProductConfigurationDependency"(id,"restaurantId","productId","sourceProductId","optionId",path,mode,"configurationVersion")
          VALUES ('dep','r1','pizza','side','a','a','ORIGINAL',1);
        """)
    deploy(history[split:])
    if configuration_v2:
        # No saved V1 exists in the supported upgrade population. Create V2 only after its discriminator migrates.
        sql(upgrade, """
        UPDATE "Product" SET "configurationVersion"=1,
          "configurationTree"='{"schemaVersion":2,"productId":"pizza","revision":1,"basePrice":"12.50","groups":[]}' WHERE id='pizza';
        INSERT INTO "ProductConfigurationDependency"(id,"restaurantId","productId","sourceProductId","optionId",path,mode,"configurationVersion")
          VALUES ('dep','r1','pizza','side','a','a','ORIGINAL',1);
        """)
    assert before == sql(upgrade,snapshot)
    assert sql(upgrade, 'SELECT count(*) FROM "MediaAsset" WHERE "validatedFormat" IS NULL') == '1'
    assert sql(upgrade, 'SELECT count(*) FROM "ProductConfigurationDependency" WHERE "sourceProductId"=\'side\'')=='1'
    sql(upgrade, """DO $$ BEGIN
      BEGIN UPDATE "ProductConfigurationDependency" SET "sourceProductId"='foreign' WHERE id='dep'; RAISE EXCEPTION 'tenant FK missing';
      EXCEPTION WHEN foreign_key_violation THEN NULL; END;
      BEGIN UPDATE "Product" SET "basePrice"=-1 WHERE id='side'; RAISE EXCEPTION 'price check missing';
      EXCEPTION WHEN check_violation THEN NULL; END;
      BEGIN UPDATE "Product" SET slug='pizza' WHERE id='side'; RAISE EXCEPTION 'unique key missing';
      EXCEPTION WHEN unique_violation THEN NULL; END;
    END $$;""")
    assert before == sql(upgrade,snapshot)
    sql("postgres","CREATE DATABASE "+recovery)
    check(recovery)
    call(pg/"pg_restore","--exit-on-error","--no-owner","-d",recovery,archive)
    assert sql(recovery,snapshot)==before
    return {"migrations":len(history),"populatedUpgrade":True,"tenants":2,"products":3,"orderItems":1,
        "beforeAfterBusinessValuesEqual":True,"existingV1LinkPreserved":not configuration_v2,"newV2LinkValidated":configuration_v2,"foreignTenantRejected":True,
        "priceCheckAndUniqueEnforced":True,"legacyMediaUnattested":True,"independentPreUpgradeRestore":True}
